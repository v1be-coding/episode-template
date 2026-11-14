import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORIGIN_HEADER } from "./client-ip.js";
import { guardRequest, spendCapResponse } from "./guard.js";
import { recordMetric } from "./metrics.js";
import { RATE_LIMIT } from "./rate-limit.js";
import type { Store } from "./store.js";

vi.mock("./metrics.js", () => ({ recordMetric: vi.fn() }));

const event = (headers: Record<string, string>) =>
  ({
    headers,
    requestContext: { http: { sourceIp: "198.51.100.7" } },
  }) as unknown as APIGatewayProxyEventV2;

const throughCloudFront = { [ORIGIN_HEADER]: "secret" };

describe("guardRequest", () => {
  let send: ReturnType<typeof vi.fn>;
  let db: Store;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("API_ORIGIN_SECRET", "secret");
    vi.stubEnv("LIMITS_TABLE", "t");
    send = vi.fn().mockResolvedValue({ Attributes: { count: { N: "1" } } });
    db = { send } as unknown as Store;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("refuses the raw execute-api address before counting anything", async () => {
    expect(await guardRequest(event({}), db)).toMatchObject({ statusCode: 403 });
    expect(send).not.toHaveBeenCalled();
  });

  it("lets a request under the limit through", async () => {
    expect(await guardRequest(event(throughCloudFront), db)).toBeUndefined();
  });

  it("answers over the limit with a handled 429", async () => {
    // 15 s into a 60-second window, so 45 s are left.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:15Z"));
    send.mockResolvedValue({ Attributes: { count: { N: String(RATE_LIMIT.requests + 1) } } });

    const response = await guardRequest(event(throughCloudFront), db);

    // The exact body in docs/agents/spec.md, which the frozen smoke test also checks.
    expect(response).toEqual({
      statusCode: 429,
      headers: { "content-type": "application/json", "retry-after": "45" },
      body: JSON.stringify({
        error: "rate_limited",
        message: "Too many requests",
        retryAfterSeconds: 45,
      }),
    });
    expect(recordMetric).toHaveBeenCalledWith("RateLimited", { client: expect.any(String) });
  });

  it("lets requests through if the counter fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockRejectedValue(new Error("throttled"));

    expect(await guardRequest(event(throughCloudFront), db)).toBeUndefined();
  });
});

describe("spendCapResponse", () => {
  it("answers with the daily_cap 429 in docs/agents/spec.md", () => {
    expect(spendCapResponse(3600)).toEqual({
      statusCode: 429,
      headers: { "content-type": "application/json", "retry-after": "3600" },
      body: JSON.stringify({
        error: "daily_cap",
        message: "The AI feature is paused until tomorrow",
        retryAfterSeconds: 3600,
      }),
    });
  });
});
