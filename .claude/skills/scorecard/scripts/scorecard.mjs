// Prints an episode's scorecard for one spec issue, from GitHub (Q28).
// Usage: node .claude/skills/scorecard/scripts/scorecard.mjs <spec issue number>
// Needs gh signed in with read access to the repo's issues, PRs and Actions.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  approvalWaitMs,
  attemptOfBranch,
  attemptStarts,
  attemptTally,
  formatDuration,
  greenAt,
  grid,
  outcomes,
} from "./lib.mjs";

const spec = Number(process.argv[2]);
if (!Number.isInteger(spec) || spec <= 0) {
  console.error("Usage: scorecard.mjs <spec issue number>");
  process.exit(1);
}

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const api = (path) => JSON.parse(gh("api", path));
// --paginate --slurp gives one array per page.
const all = (path) => JSON.parse(gh("api", "--paginate", "--slurp", path)).flat();

const repo = gh("repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner").trim();
const work = mkdtempSync(join(tmpdir(), "scorecard-"));

function reportOf(runId) {
  const artifact = api(`repos/${repo}/actions/runs/${runId}/artifacts`).artifacts.find(
    (a) => a.name === "frozen-reports" && !a.expired,
  );
  if (!artifact) return null;
  const zip = join(work, `${artifact.id}.zip`);
  writeFileSync(
    zip,
    execFileSync("gh", ["api", `repos/${repo}/actions/artifacts/${artifact.id}/zip`]),
  );
  const dir = join(work, String(artifact.id));
  execFileSync("unzip", ["-q", "-o", zip, "results.json", "-d", dir]);
  return outcomes(JSON.parse(readFileSync(join(dir, "results.json"), "utf8")));
}

function runsOf(branch, event) {
  const runs = all(
    `repos/${repo}/actions/workflows/deploy.yml/runs?branch=${encodeURIComponent(branch)}&event=${event}&per_page=100`,
  ).flatMap((page) => page.workflow_runs);
  return (
    runs
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .map((run) => ({
        run,
        jobs: all(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`).flatMap((p) => p.jobs),
      }))
      // A run where nothing past `rounds` ran, such as a draft push or the
      // teardown on close, isn't a CI round of the chain.
      .filter(
        ({ jobs }) =>
          event !== "pull_request" ||
          jobs.some((j) => j.name === "rounds" && j.conclusion !== "skipped"),
      )
  );
}

try {
  const starts = attemptStarts(all(`repos/${repo}/issues/${spec}/comments?per_page=100`));
  const prs = all(`repos/${repo}/pulls?state=all&per_page=100`)
    .map((pr) => ({ pr, attempt: attemptOfBranch(pr.head.ref, spec) }))
    .filter((p) => p.attempt !== null)
    .sort((a, b) => a.attempt - b.attempt);
  const tally = attemptTally(
    prs.map((p) => ({ ...p, merged: Boolean(p.pr.merged_at), labels: p.pr.labels.map((l) => l.name) })),
  );
  const landed = tally.landed;

  const lines = [`# Scorecard for #${spec}`, ""];
  const row = (k, v) => lines.push(`| ${k} | ${v} |`);
  lines.push("| Measure | Value |", "| --- | --- |");

  const gridRuns = [];
  let firstRunPassed = "No CI run found for attempt 1.";
  let timeToGreen = "Not green yet.";

  for (const { pr, attempt } of prs) {
    const runs = runsOf(pr.head.ref, "pull_request");
    runs.forEach(({ run }, i) => {
      const found = reportOf(run.id);
      if (found) gridRuns.push({ label: `A${attempt}·${i + 1}`, outcomes: found, runId: run.id });
      if (attempt === 1 && i === 0) {
        firstRunPassed = found
          ? `${found.filter((o) => o.outcome === "passed" || o.outcome === "flaky").length} of ${found.length}`
          : "0. Attempt 1's first CI run didn't reach the frozen tests.";
      }
    });
    if (pr === landed?.pr) {
      const start = starts.find((s) => s.attempt === attempt)?.at;
      const jobs = runs.flatMap((r) => r.jobs);
      const greens = runs.map((r) => greenAt(r.jobs)).filter((t) => t !== null);
      const green = greens.length ? Math.max(...greens) : null;
      if (start && green) {
        const waited = approvalWaitMs(jobs, start, green);
        timeToGreen = `${formatDuration(green - start - waited)} (${formatDuration(green - start)} minus ${formatDuration(waited)} waiting for approvals)`;
      } else if (!start) {
        timeToGreen = `Unknown: no "Attempt ${attempt} started at" comment on #${spec}.`;
      }
      const prod = runsOf("main", "push").find(({ run }) => run.head_sha === pr.merge_commit_sha);
      const prodReport = prod && reportOf(prod.run.id);
      if (prodReport) gridRuns.push({ label: "prod", outcomes: prodReport, runId: prod.run.id });
    }
  }

  row("Time to green", timeToGreen);
  row(
    "Attempts",
    landed
      ? `${tally.attempts} (${tally.failed} labelled \`failed-attempt\`, plus the one that landed)`
      : tally.attempts
        ? `${tally.attempts}, all labelled \`failed-attempt\`, and none landed`
        : "None yet",
  );
  row("Frozen tests passing on attempt 1's first CI run", firstRunPassed);
  row("Landed", landed ? `#${landed.pr.number}` : "No");

  // Merged PRs that changed frozen/ after the first attempt began: candidates
  // for "frozen tests that turned out wrong", which needs a person's judgment.
  const since = starts[0]?.at ?? Infinity;
  const frozenFixes = all(`repos/${repo}/pulls?state=closed&per_page=100`)
    .filter(
      (pr) =>
        pr.merged_at &&
        Date.parse(pr.merged_at) > since &&
        attemptOfBranch(pr.head.ref, spec) === null,
    )
    .filter((pr) =>
      all(`repos/${repo}/pulls/${pr.number}/files?per_page=100`).some((f) =>
        f.filename.startsWith("frozen/"),
      ),
    )
    .map((pr) => `#${pr.number} ${pr.title}`);

  lines.push(
    "",
    "## Frozen tests by run",
    "",
    grid(gridRuns),
    "",
    "## For judgment",
    "",
    `- **PRs that changed \`frozen/\` after attempt 1 began:** ${frozenFixes.length ? frozenFixes.join("; ") : "none"}.`,
    `- **Runs:** ${gridRuns.map((r) => `${r.label} = ${r.runId}`).join(", ") || "none"}.`,
  );
  console.log(lines.join("\n"));
} finally {
  rmSync(work, { recursive: true, force: true });
}
