import { UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import type { Store } from "./store.js";

// Q59: per IP, on every /api/* route. Under Cloudflare's 300 a minute, and under
// the frozen smoke check's 240, so that test trips this limit first.
export const RATE_LIMIT = { requests: 120, windowSeconds: 60 };

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

// A fixed window per IP. Rows expire by themselves through the table's TTL.
export async function checkRateLimit(
  db: Store,
  table: string,
  ipHash: string,
  now: number = Date.now(),
  limit = RATE_LIMIT,
): Promise<RateLimitResult> {
  const nowSeconds = Math.floor(now / 1000);
  const windowStart = nowSeconds - (nowSeconds % limit.windowSeconds);
  const windowEnd = windowStart + limit.windowSeconds;

  const result = await db.send(
    new UpdateItemCommand({
      TableName: table,
      Key: { pk: { S: `ip#${ipHash}#${windowStart}` } },
      UpdateExpression: "ADD #count :one SET #expires = if_not_exists(#expires, :expires)",
      ExpressionAttributeNames: { "#count": "count", "#expires": "expires" },
      ExpressionAttributeValues: {
        ":one": { N: "1" },
        ":expires": { N: String(windowEnd + limit.windowSeconds) },
      },
      ReturnValues: "UPDATED_NEW",
    }),
  );

  const count = Number(result.Attributes?.count?.N ?? "0");
  if (count <= limit.requests) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(1, windowEnd - nowSeconds) };
}
