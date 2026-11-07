import { UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { describe, expect, it, vi } from "vitest";
import { checkRateLimit, RATE_LIMIT } from "./rate-limit.js";
import type { Store } from "./store.js";

// A store that answers with the given count.
const storeReturning = (count: number) => {
  const send = vi.fn().mockResolvedValue({ Attributes: { count: { N: String(count) } } });
  return { db: { send } as unknown as Store, send };
};

// 12:00:30 UTC, half way through a minute.
const now = Date.UTC(2026, 10, 7, 12, 0, 30);

describe("checkRateLimit", () => {
  it("allows the limit's last request", async () => {
    const { db } = storeReturning(RATE_LIMIT.requests);

    expect(await checkRateLimit(db, "t", "h", now)).toEqual({ allowed: true });
  });

  it("refuses the next one until the window ends", async () => {
    const { db } = storeReturning(RATE_LIMIT.requests + 1);

    expect(await checkRateLimit(db, "t", "h", now)).toEqual({
      allowed: false,
      retryAfterSeconds: 30,
    });
  });

  it("counts per IP and per window, and lets rows expire", async () => {
    const { db, send } = storeReturning(1);

    await checkRateLimit(db, "limits", "abc", now);

    const command = send.mock.calls[0]?.[0] as UpdateItemCommand;
    const windowStart = Date.UTC(2026, 10, 7, 12, 0, 0) / 1000;
    expect(command.input).toMatchObject({
      TableName: "limits",
      Key: { pk: { S: `ip#abc#${windowStart}` } },
      ExpressionAttributeValues: { ":expires": { N: String(windowStart + 120) } },
    });
  });

  it("never asks a caller to wait less than a second", async () => {
    const { db } = storeReturning(RATE_LIMIT.requests + 1);
    const lastMoment = Date.UTC(2026, 10, 7, 12, 0, 59, 900);

    expect(await checkRateLimit(db, "t", "h", lastMoment)).toMatchObject({ retryAfterSeconds: 1 });
  });
});
