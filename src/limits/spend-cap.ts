import { ConditionalCheckFailedException, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { limitsConfig } from "./config.js";
import { recordMetric } from "./metrics.js";
import { store, type Store } from "./store.js";

// Q60: a daily dollar cap on paid AI calls, per target, by UTC day. Anthropic has
// no daily cap of its own, so this is the template's. The workspace's rate
// limits and monthly spend limit sit behind it.

// Prices per million tokens, from Anthropic's pricing page for the model used.
export type Prices = {
  input: number;
  output: number;
  cacheWrite?: number;
  cacheRead?: number;
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

// Stored as whole micro-dollars, so DynamoDB's sums stay exact.
const MICROS = 1_000_000;
const toMicros = (usd: number) => Math.ceil(usd * MICROS);

export function costUsd(usage: Usage, prices: Prices): number {
  const perToken = (perMillion: number) => perMillion / 1_000_000;
  return (
    usage.input_tokens * perToken(prices.input) +
    usage.output_tokens * perToken(prices.output) +
    (usage.cache_creation_input_tokens ?? 0) * perToken(prices.cacheWrite ?? prices.input) +
    (usage.cache_read_input_tokens ?? 0) * perToken(prices.cacheRead ?? prices.input)
  );
}

// Worst case for one call, so the reservation can't be too small:
// every input token at full price and every allowed output token used.
export function worstCaseUsd(inputTokens: number, maxTokens: number, prices: Prices): number {
  return costUsd({ input_tokens: inputTokens, output_tokens: maxTokens }, prices);
}

const day = (now: number) => new Date(now).toISOString().slice(0, 10);

export function secondsUntilNextDay(now: number = Date.now()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now) / 1000));
}

async function add(db: Store, table: string, now: number, micros: number, room?: number) {
  await db.send(
    new UpdateItemCommand({
      TableName: table,
      Key: { pk: { S: `spend#${day(now)}` } },
      UpdateExpression: "ADD #spent :micros SET #expires = if_not_exists(#expires, :expires)",
      ...(room === undefined
        ? {}
        : { ConditionExpression: "attribute_not_exists(#spent) OR #spent <= :room" }),
      ExpressionAttributeNames: { "#spent": "spent", "#expires": "expires" },
      ExpressionAttributeValues: {
        ":micros": { N: String(micros) },
        ":expires": { N: String(Math.floor(now / 1000) + 2 * 86_400) },
        ...(room === undefined ? {} : { ":room": { N: String(room) } }),
      },
    }),
  );
}

export type SpendResult<T> = { ok: true; value: T } | { ok: false; retryAfterSeconds: number };

// Reserves the worst case before the call, so calls running at the same time
// can't overshoot together, then settles to the real cost. If the store fails,
// the call doesn't happen, because this guards money.
export async function withSpendCap<T>(
  worstCase: number,
  call: () => Promise<{ value: T; costUsd: number }>,
  options: { db?: Store; table?: string; capUsd?: number; now?: number } = {},
): Promise<SpendResult<T>> {
  const config = limitsConfig();
  const db = options.db ?? store();
  const table = options.table ?? config.table;
  const capMicros = toMicros(options.capUsd ?? config.dailyCapUsd);
  const now = options.now ?? Date.now();
  const reserved = toMicros(worstCase);

  try {
    await add(db, table, now, reserved, capMicros - reserved);
  } catch (error) {
    if (!(error instanceof ConditionalCheckFailedException)) throw error;
    recordMetric("SpendCapReached");
    return { ok: false, retryAfterSeconds: secondsUntilNextDay(now) };
  }

  let outcome: { value: T; costUsd: number };
  try {
    outcome = await call();
  } catch (error) {
    // A failed call is treated as free, so the reservation comes back.
    await add(db, table, now, -reserved);
    throw error;
  }
  await add(db, table, now, toMicros(outcome.costUsd) - reserved);
  return { ok: true, value: outcome.value };
}
