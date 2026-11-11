import { ConditionalCheckFailedException, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordMetric } from "./metrics.js";
import { costUsd, secondsUntilNextDay, withSpendCap, worstCaseUsd } from "./spend-cap.js";
import type { Store } from "./store.js";

vi.mock("./metrics.js", () => ({ recordMetric: vi.fn() }));

const prices = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };
const now = Date.UTC(2026, 10, 7, 18, 0, 0);
const added = (send: ReturnType<typeof vi.fn>) =>
  send.mock.calls.map(
    ([command]) => (command as UpdateItemCommand).input.ExpressionAttributeValues?.[":micros"]?.N,
  );

describe("costUsd", () => {
  it("prices every kind of token", () => {
    const usage = {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    };

    expect(costUsd(usage, prices)).toBeCloseTo(1 + 5 + 1.25 + 0.1);
  });

  it("takes the worst case as every allowed output token", () => {
    expect(worstCaseUsd(2_000, 500, prices)).toBeCloseTo(0.002 + 0.0025);
  });
});

describe("secondsUntilNextDay", () => {
  it("counts to the next midnight UTC", () => {
    expect(secondsUntilNextDay(now)).toBe(6 * 3600);
  });
});

describe("withSpendCap", () => {
  let send: ReturnType<typeof vi.fn>;
  let db: Store;

  beforeEach(() => {
    vi.resetAllMocks();
    send = vi.fn().mockResolvedValue({});
    db = { send } as unknown as Store;
  });

  it("reserves the worst case, then settles to the real cost", async () => {
    const result = await withSpendCap(
      0.01,
      () => Promise.resolve({ value: "reply", costUsd: 0.004 }),
      {
        db,
        table: "t",
        capUsd: 1,
        now,
      },
    );

    expect(result).toEqual({ ok: true, value: "reply" });
    expect(added(send)).toEqual(["10000", "-6000"]);
    const reserve = send.mock.calls[0]?.[0] as UpdateItemCommand;
    expect(reserve.input).toMatchObject({
      Key: { pk: { S: "spend#2026-11-07" } },
      ExpressionAttributeValues: { ":room": { N: String(1_000_000 - 10_000) } },
    });
  });

  it("refuses the call once the day's cap is reached", async () => {
    send.mockRejectedValueOnce(
      new ConditionalCheckFailedException({ message: "no", $metadata: {} }),
    );
    const call = vi.fn();

    const result = await withSpendCap(0.01, call, { db, table: "t", capUsd: 1, now });

    expect(result).toEqual({ ok: false, retryAfterSeconds: 6 * 3600 });
    expect(call).not.toHaveBeenCalled();
    expect(recordMetric).toHaveBeenCalledWith("SpendCapReached");
  });

  it("gives the reservation back if the call fails", async () => {
    const failing = () => Promise.reject(new Error("overloaded"));

    await expect(withSpendCap(0.01, failing, { db, table: "t", capUsd: 1, now })).rejects.toThrow(
      "overloaded",
    );
    expect(added(send)).toEqual(["10000", "-10000"]);
  });

  it("refuses the call if the counter can't be reached", async () => {
    send.mockRejectedValueOnce(new Error("network"));
    const call = vi.fn();

    await expect(withSpendCap(0.01, call, { db, table: "t", capUsd: 1, now })).rejects.toThrow(
      "network",
    );
    expect(call).not.toHaveBeenCalled();
  });
});
