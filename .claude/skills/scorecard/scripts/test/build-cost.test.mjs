import assert from "node:assert/strict";
import { test } from "node:test";
import { commandOf, costState, messagesIn, priceOf, sum, total, windows } from "../build-cost-lib.mjs";

const command = (name, args, at) => ({
  type: "user",
  timestamp: at,
  message: { content: `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>\n<command-args>${args}</command-args>` },
});
const reply = (id, at, usage, model = "claude-opus-5-5") => ({ type: "assistant", timestamp: at, message: { id, model, usage } });
const usage = (u) => ({ input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 }, ...u });

test("reads a slash command and its arguments", () => {
  assert.deepEqual(commandOf(command("attempt", "42", "t1")), { name: "attempt", args: "42", at: "t1" });
  assert.equal(commandOf({ type: "user", message: { content: "hello" } }), null);
});

test("a command's window runs to the session's next command", () => {
  const entries = [command("clear", "", "2026-01-01T00"), command("attempt", "#42", "2026-01-01T01"), command("scorecard", "42", "2026-01-01T05")];
  assert.deepEqual(windows(entries, "attempt", 42), [{ from: "2026-01-01T01", to: "2026-01-01T05" }]);
  assert.deepEqual(windows(entries, "attempt", 7), []);
});

test("counts each message once, inside the window only", () => {
  const w = [{ from: "b", to: "d" }];
  const entries = [
    reply("m0", "a", usage({ output_tokens: 99 })),
    reply("m1", "b", usage({ output_tokens: 5 })),
    reply("m1", "b", usage({ output_tokens: 5 })),
    reply("m2", "c", usage({ output_tokens: 7 })),
    reply("m3", "d", usage({ output_tokens: 99 })),
  ];
  assert.equal(total(messagesIn(entries, w)).output, 12);
});

test("prices each token type at its own rate", () => {
  // Opus 5.5: $4 input, $5 5m write, $8 1h write, $0.20 read, $20 output per MTok.
  const m = { model: "claude-opus-5-5", usage: usage({ input_tokens: 1e6, cache_read_input_tokens: 1e6, output_tokens: 1e6, cache_creation: { ephemeral_5m_input_tokens: 1e6, ephemeral_1h_input_tokens: 1e6 } }) };
  assert.equal(priceOf(m).usd, 4 + 5 + 8 + 0.2 + 20);
  assert.equal(priceOf({ ...m, usage: { ...m.usage, speed: "fast" } }).usd, (4 + 5 + 8 + 0.2 + 20) * 2);
  assert.equal(priceOf({ model: "claude-unknown", usage: usage({}) }).usd, null);
});

test("prices a long Haiku 5.5 prompt at the higher rate", () => {
  const short = priceOf({ model: "claude-haiku-5-5", usage: usage({ input_tokens: 100_000 }) }).usd;
  const long = priceOf({ model: "claude-haiku-5-5", usage: usage({ input_tokens: 100_001 }) }).usd;
  assert.ok(Math.abs(short - 0.01) < 1e-9);
  assert.ok(Math.abs(long - 100_001 * 0.5e-6) < 1e-9);
});

test("reads Claude Code's cost record, and adds sessions together", () => {
  // The record of #42's attempt 1, session 934ddd2e, trimmed.
  const record = {
    type: "cost-state",
    totalCostUSD: 2.2552422,
    hasUnknownModelCost: false,
    modelUsage: {
      "claude-haiku-5-5": { inputTokens: 7632, outputTokens: 596, cacheReadInputTokens: 0, cacheCreationEphemeral5mInputTokens: 0, cacheCreationEphemeral1hInputTokens: 0 },
      "claude-opus-5-5": { inputTokens: 834, outputTokens: 27959, cacheReadInputTokens: 3569965, cacheCreationEphemeral5mInputTokens: 99792, cacheCreationEphemeral1hInputTokens: 59839 },
    },
  };
  const t = costState([{ type: "cost-state", totalCostUSD: 1, modelUsage: {} }, record]);
  assert.equal(t.usd, 2.2552422);
  assert.equal(t.read, 3569965);
  assert.deepEqual([...t.models], ["claude-haiku-5-5", "claude-opus-5-5"]);
  assert.equal(costState([reply("m", "a", usage({}))]), null);
  assert.equal(sum([t, t]).usd, 2.2552422 * 2);
});

test("the price table reproduces Claude Code's own Opus 5.5 total", () => {
  // Same session's Opus usage. Claude Code priced it at $2.254181.
  const m = { model: "claude-opus-5-5", usage: usage({ input_tokens: 834, cache_read_input_tokens: 3569965, output_tokens: 27959, cache_creation: { ephemeral_5m_input_tokens: 99792, ephemeral_1h_input_tokens: 59839 } }) };
  assert.ok(Math.abs(priceOf(m).usd - 2.254181) < 1e-6);
});
