// Build cost from Claude Code session transcripts (the series glossary's
// "Build cost"). Pure functions; build-cost.mjs reads the files.
//
// The source is the session's `cost-state` record, Claude Code's own total at
// list price. It covers every API call, subagents and Claude Code's side calls
// included. Reply lines miss the side calls, about 4% on #42's attempts, so
// summing them with PRICES is only the fallback for a session with no record.

// List prices in USD per million tokens, from
// https://platform.claude.com/docs/en/about-claude/pricing, fetched 2026-11-12.
// Update this table, and PRICES_FETCHED, when the page changes.
export const PRICES_FETCHED = "2026-11-12";
const p = (input, write5m, write1h, read, output) => ({ input, write5m, write1h, read, output });
export const PRICES = {
  "claude-fable-5-2": p(8, 10, 16, 0.2, 40),
  "claude-fable-5-1": p(10, 12.5, 20, 0.25, 50),
  "claude-fable-5": p(10, 12.5, 20, 1, 50),
  "claude-opus-5-5": p(4, 5, 8, 0.2, 20),
  "claude-opus-5": p(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-8": p(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-7": p(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-6": p(5, 6.25, 10, 0.5, 25),
  "claude-sonnet-5-5": p(2, 2.5, 4, 0.1, 10),
  "claude-sonnet-5": p(2, 2.5, 4, 0.2, 10),
  "claude-sonnet-4-6": p(3, 3.75, 6, 0.3, 15),
  "claude-haiku-5-5": p(0.1, 0.125, 0.2, 0.01, 0.5),
  "claude-haiku-5-5@long": p(0.5, 0.625, 1, 0.05, 2.5), // prompts over 100,000 tokens
  "claude-haiku-4-5": p(1, 1.25, 2, 0.1, 5),
};
// Fast mode is a flat multiple of the standard rates on the models that have it.
const FAST = { "claude-opus-5-5": 2, "claude-opus-5": 2, "claude-opus-4-8": 2 };
const US_ONLY = 1.1; // inference_geo "us", Claude 4.6 and later

// The command that opened each window, such as `/attempt 42`, from a
// transcript's user entries.
export function commandOf(entry) {
  if (entry?.type !== "user" || typeof entry.message?.content !== "string") return null;
  const m = /<command-name>\/?([^<]*)<\/command-name>[\s\S]*?<command-args>([^<]*)<\/command-args>/.exec(
    entry.message.content,
  );
  return m ? { name: m[1].trim(), args: m[2].trim(), at: entry.timestamp } : null;
}

// Time windows in one session that a command for this spec opened. A window runs
// from the command to the session's next command, or to the end.
export function windows(entries, name, spec) {
  const commands = entries.map(commandOf).filter(Boolean);
  const out = [];
  commands.forEach((c, i) => {
    if (c.name !== name || c.args.replace(/^#/, "") !== String(spec)) return;
    out.push({ from: c.at, to: commands[i + 1]?.at ?? null });
  });
  return out;
}

const inWindow = (at, w) => at >= w.from && (w.to === null || at < w.to);

// Usage per API message inside the windows. Claude Code writes one line per
// content block of a message, so keep the last line for each message ID.
export function messagesIn(entries, wins) {
  const byId = new Map();
  for (const e of entries) {
    if (e.type !== "assistant" || !e.message?.usage || !e.timestamp) continue;
    if (!wins.some((w) => inWindow(e.timestamp, w))) continue;
    byId.set(e.message.id ?? `${e.timestamp}:${byId.size}`, e.message);
  }
  return [...byId.values()];
}

export function priceOf(message) {
  const u = message.usage;
  const write1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const write5m = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0);
  const tokens = {
    input: u.input_tokens ?? 0,
    write5m,
    write1h,
    read: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
  };
  let model = message.model;
  if (model === "claude-haiku-5-5" && tokens.input + tokens.write5m + tokens.write1h + tokens.read > 100_000)
    model = "claude-haiku-5-5@long";
  const rates = PRICES[model];
  if (!rates) return { tokens, usd: null, model: message.model };
  let usd = 0;
  for (const k of Object.keys(tokens)) usd += (tokens[k] * rates[k]) / 1e6;
  if (u.speed === "fast") usd *= FAST[message.model] ?? 1;
  if (u.inference_geo === "us") usd *= US_ONLY;
  return { tokens, usd, model: message.model };
}

// Totals for a list of messages: tokens by type, dollars, models, and any
// message whose model has no price.
export function total(messages) {
  const t = { input: 0, write5m: 0, write1h: 0, read: 0, output: 0, usd: 0, messages: 0, models: new Set(), unpriced: new Set() };
  for (const m of messages) {
    const { tokens, usd, model } = priceOf(m);
    for (const k of Object.keys(tokens)) t[k] += tokens[k];
    t.messages++;
    t.models.add(model);
    if (usd === null) t.unpriced.add(model);
    else t.usd += usd;
  }
  return t;
}

export const allTokens = (t) => t.input + t.write5m + t.write1h + t.read + t.output;

// The session's last cost-state record, as a total, or null.
export function costState(entries) {
  const s = entries.findLast((e) => e.type === "cost-state" && e.modelUsage);
  if (!s) return null;
  const t = { input: 0, write5m: 0, write1h: 0, read: 0, output: 0, usd: s.totalCostUSD, messages: null, models: new Set(), unpriced: new Set() };
  for (const [model, u] of Object.entries(s.modelUsage)) {
    t.input += u.inputTokens ?? 0;
    t.write5m += u.cacheCreationEphemeral5mInputTokens ?? 0;
    t.write1h += u.cacheCreationEphemeral1hInputTokens ?? 0;
    t.read += u.cacheReadInputTokens ?? 0;
    t.output += u.outputTokens ?? 0;
    t.models.add(model);
  }
  if (s.hasUnknownModelCost) t.unpriced.add("a model Claude Code has no price for");
  return t;
}

// Adds totals together.
export function sum(totals) {
  const t = { input: 0, write5m: 0, write1h: 0, read: 0, output: 0, usd: 0, messages: null, models: new Set(), unpriced: new Set() };
  for (const x of totals) {
    for (const k of ["input", "write5m", "write1h", "read", "output", "usd"]) t[k] += x[k];
    for (const m of x.models) t.models.add(m);
    for (const m of x.unpriced) t.unpriced.add(m);
  }
  return t;
}
