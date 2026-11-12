// Prints an episode's build cost for one spec issue, from the Claude Code session
// transcripts on this machine. Run it from the repo root, in the container.
// Usage: node .claude/skills/scorecard/scripts/build-cost.mjs <spec issue number> [--dir <transcripts folder>]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { allTokens, costState, messagesIn, PRICES_FETCHED, sum, total, windows } from "./build-cost-lib.mjs";

const args = process.argv.slice(2);
const spec = Number(args[0]);
if (!Number.isInteger(spec) || spec <= 0) {
  console.error("Usage: build-cost.mjs <spec issue number> [--dir <transcripts folder>]");
  process.exit(1);
}
const dirFlag = args.indexOf("--dir");
// Claude Code keeps a folder per working directory, named after its path.
const dir =
  dirFlag >= 0
    ? args[dirFlag + 1]
    : join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects", process.cwd().replace(/[^A-Za-z0-9]/g, "-"));
if (!existsSync(dir)) {
  console.error(`No transcripts at ${dir}. Run from the repo root, or pass --dir.`);
  process.exit(1);
}

const read = (file) =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });

// Each part: every session with that command for this spec, whole. A session's
// cost is its cost-state record. Without one, it's the sum of its reply lines
// from the command on, subagents included, which runs a little low.
function part(command) {
  const totals = [];
  const sessions = [];
  const estimated = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
    const entries = read(join(dir, file));
    const wins = windows(entries, command, spec);
    if (wins.length === 0) continue;
    const id = file.replace(/\.jsonl$/, "");
    sessions.push(id);
    const recorded = costState(entries);
    if (recorded) {
      totals.push(recorded);
      continue;
    }
    estimated.push(id);
    const messages = messagesIn(entries, wins);
    const subagents = join(dir, id, "subagents");
    if (existsSync(subagents))
      for (const sub of readdirSync(subagents).filter((f) => f.endsWith(".jsonl")))
        messages.push(...messagesIn(read(join(subagents, sub)), wins));
    totals.push(total(messages));
  }
  return { sessions, estimated, t: sum(totals) };
}

const millions = (n) => `${(n / 1e6).toFixed(2)}M`;
const usd = (t) => (t.unpriced.size ? `$${t.usd.toFixed(2)} + unpriced ${[...t.unpriced].join(", ")}` : `$${t.usd.toFixed(2)}`);

const attempt = part("attempt");
const acceptance = part("acceptance");
const row = (name, { sessions, t }) =>
  sessions.length === 0
    ? `| ${name} | 0 | none found | none found |`
    : `| ${name} | ${sessions.length} | ${millions(allTokens(t))} | ${usd(t)} |`;

console.log(`### Build cost for #${spec}

| Part | Sessions | Tokens | Cost at list price |
| --- | --- | --- | --- |
${row("**Build cost:** `/attempt` sessions and their subagents", attempt)}
${row("Spec phase: `/acceptance` sessions, shown apart", acceptance)}
`);
for (const [name, { t, sessions, estimated }] of [
  ["Attempt", attempt],
  ["Spec phase", acceptance],
]) {
  if (sessions.length === 0) continue;
  console.log(
    `- **${name} tokens:** ${millions(t.input)} input, ${millions(t.write5m + t.write1h)} cache writes, ${millions(t.read)} cache reads, ${millions(t.output)} output. Models: ${[...t.models].join(", ")}. Sessions: ${sessions.map((s) => s.slice(0, 8)).join(", ")}.`,
  );
  if (estimated.length)
    console.log(`- **Estimated:** ${estimated.map((s) => s.slice(0, 8)).join(", ")} had no cost record, so its reply lines were priced instead. That runs about 4% low.`);
}
console.log(`- **Prices:** Claude Code's own total for each session, at Anthropic's list prices (https://platform.claude.com/docs/en/about-claude/pricing, matched on ${PRICES_FETCHED}). A subscription bills differently, so this is what the same work costs on the API. Each session counts whole, including anything before or after the command in it.
- **Not counted:** sessions outside this repo's transcripts folder (${dir}), such as \`/acceptance\` run as a subagent from another folder, or frozen fixes made elsewhere.`);
