// Checks a spec is ready for /attempt before the run starts: the frozen tests
// are merged, and the tickets exist. The order is spec → /acceptance →
// /to-tickets → /attempt. Reads only. Exits 1 with every problem listed.
//
//   node .claude/bin/attempt-preflight.mjs <spec issue number>
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const CONTRACT_HEADING = /^## Test contract\s*$/m;
const CONTRACT_ID = /\bC([1-9][0-9]*)\b/g;

// The C-line IDs in the spec's "## Test contract" section, in order.
export function contractIds(body) {
  const start = body.search(CONTRACT_HEADING);
  if (start === -1) return null;
  const rest = body.slice(start).split("\n").slice(1).join("\n");
  const end = rest.search(/^## /m);
  const section = end === -1 ? rest : rest.slice(0, end);
  return [
    ...new Set([...section.matchAll(/^\s*[-*]?\s*\**C([1-9][0-9]*)\b/gm)].map((m) => `C${m[1]}`)),
  ];
}

// Problems that stop the run, and warnings that don't, from what was read.
export function check({ body, tickets, frozenText, ticketBodies }) {
  const problems = [];
  const warnings = [];
  const ids = contractIds(body);
  if (ids === null || ids.length === 0) {
    problems.push(
      "The spec has no `## Test contract` section with C-lines. Run /acceptance first.",
    );
  } else if (!ids.some((id) => new RegExp(`@${id}\\b`).test(frozenText))) {
    problems.push(
      "No frozen acceptance test on origin/main is tagged with this spec's contract IDs. Merge /acceptance's frozen PR first.",
    );
  }
  const open = tickets.filter((t) => t.state === "open");
  if (tickets.length === 0)
    problems.push("The spec has no tickets (sub-issues). Run /to-tickets after /acceptance.");
  else if (open.length === 0)
    problems.push(`All ${tickets.length} tickets are closed, so there's nothing to build.`);
  if (ids && ids.length > 0 && ticketBodies.length > 0) {
    const cited = new Set(
      ticketBodies.flatMap((b) => [...b.matchAll(CONTRACT_ID)].map((m) => `C${m[1]}`)),
    );
    const missing = ids.filter((id) => !cited.has(id));
    if (missing.length > 0) warnings.push(`No ticket cites ${missing.join(", ")}.`);
  }
  return { problems, warnings };
}

const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function main() {
  const spec = process.argv[2] ?? "";
  if (!/^[1-9][0-9]*$/.test(spec)) {
    process.stderr.write("Usage: node .claude/bin/attempt-preflight.mjs <spec issue number>\n");
    process.exit(2);
  }
  run("git", ["fetch", "--quiet", "origin", "main"]);
  const body = JSON.parse(run("gh", ["issue", "view", spec, "--json", "body"])).body ?? "";
  const tickets = JSON.parse(
    run("gh", [
      "api",
      "--method",
      "GET",
      `repos/{owner}/{repo}/issues/${spec}/sub_issues?per_page=100`,
      "--jq",
      "[.[] | {number, state}]",
    ]) || "[]",
  );
  const files = run("git", ["ls-tree", "-r", "--name-only", "origin/main", "frozen/acceptance/"])
    .split("\n")
    .filter((f) => f.endsWith(".spec.ts"));
  const frozenText = files.map((f) => run("git", ["show", `origin/main:${f}`])).join("\n");
  const ticketBodies = tickets.map(
    (t) => JSON.parse(run("gh", ["issue", "view", String(t.number), "--json", "body"])).body ?? "",
  );
  const { problems, warnings } = check({ body, tickets, frozenText, ticketBodies });
  for (const w of warnings) process.stdout.write(`Warning: ${w}\n`);
  if (problems.length > 0) {
    for (const p of problems) process.stderr.write(`Not ready: ${p}\n`);
    process.exit(1);
  }
  const open = tickets.filter((t) => t.state === "open").length;
  process.stdout.write(`Ready: ${open} open tickets, and the frozen tests are on origin/main.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    const detail = String(error.stderr ?? error.message)
      .trim()
      .split("\n")[0];
    process.stderr.write(`Not ready: couldn't read the spec, its tickets or main (${detail}).\n`);
    process.exit(1);
  }
}
