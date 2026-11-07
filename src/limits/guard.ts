import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { cameThroughCloudFront, clientIp, hashIp } from "./client-ip.js";
import { limitsConfig } from "./config.js";
import { recordMetric } from "./metrics.js";
import { checkRateLimit } from "./rate-limit.js";
import { store, type Store } from "./store.js";

// Runs before every route. Returns a response to send instead, or undefined to
// carry on.
export async function guardRequest(
  event: APIGatewayProxyEventV2,
  db: Store = store(),
): Promise<APIGatewayProxyResultV2 | undefined> {
  const config = limitsConfig();

  // Refused before any counter, so the raw address costs no DynamoDB write.
  if (!cameThroughCloudFront(event, config.originSecret)) {
    return { statusCode: 403, body: "" };
  }

  const ipHash = hashIp(clientIp(event, config.ipSource), config.originSecret);
  try {
    const result = await checkRateLimit(db, config.table, ipHash);
    if (result.allowed) return undefined;

    recordMetric("RateLimited", { client: ipHash });
    return {
      statusCode: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(result.retryAfterSeconds),
      },
      body: JSON.stringify({
        error: "rate_limited",
        message: "Too many requests",
        retryAfterSeconds: result.retryAfterSeconds,
      }),
    };
  } catch (error) {
    // A broken counter mustn't take the app down, so the request goes through.
    console.error("Rate limit check failed", error);
    return undefined;
  }
}

// What an AI route returns when withSpendCap says no. The rest of the app keeps
// working, and the client can tell this apart from the per-IP limit.
export function spendCapResponse(retryAfterSeconds: number): APIGatewayProxyResultV2 {
  return {
    statusCode: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSeconds) },
    body: JSON.stringify({
      error: "daily_cap",
      message: "The AI feature is paused until tomorrow",
      retryAfterSeconds,
    }),
  };
}
