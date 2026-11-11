// Pure parts of the scorecard, so they can be tested without GitHub (Q28).
// scorecard.mjs fetches the data and calls these.

const START = /^Attempt (\d+) started at (\S+?)\.?\s*$/m;

/** Attempt start times from the spec issue's comments, as /attempt writes them. */
export function attemptStarts(comments) {
  const starts = new Map();
  for (const c of comments) {
    const m = START.exec(c.body ?? "");
    const at = m && Date.parse(m[2]);
    if (m && !Number.isNaN(at) && !starts.has(Number(m[1]))) starts.set(Number(m[1]), at);
  }
  return [...starts].sort((a, b) => a[0] - b[0]).map(([attempt, at]) => ({ attempt, at }));
}

/** The attempt number from a branch named attempt-<spec>-<n>, or null. */
export function attemptOfBranch(branch, spec) {
  const m = new RegExp(`^attempt-${spec}-(\\d+)$`).exec(branch);
  return m ? Number(m[1]) : null;
}

// Jobs that wait for the user's approval in a GitHub environment. A waiting
// job is created when the wait begins and starts once approved, so its whole
// created-to-completed span counts. That adds the job's few seconds of work.
const APPROVAL_JOBS = new Set(["checklist", "cost-approval"]);

/** Milliseconds spent waiting for approvals between `from` and `to`, overlaps counted once. */
export function approvalWaitMs(jobs, from, to) {
  const spans = jobs
    .filter((j) => APPROVAL_JOBS.has(j.name) && j.conclusion !== "skipped" && j.completed_at)
    .map((j) => [
      Math.max(Date.parse(j.created_at), from),
      Math.min(Date.parse(j.completed_at), to),
    ])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = -Infinity;
  for (const [a, b] of spans) {
    if (b <= end) continue;
    total += b - Math.max(a, end);
    end = b;
  }
  return total;
}

/** When `green` passed in a run, or null. */
export function greenAt(jobs) {
  const green = jobs.find((j) => j.name === "green" && j.conclusion === "success");
  return green ? Date.parse(green.completed_at) : null;
}

const OUTCOME = { expected: "passed", flaky: "flaky", unexpected: "failed", skipped: "skipped" };

/** Each frozen test's outcome in one Playwright JSON report. */
export function outcomes(results) {
  const found = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        found.push({
          test: `${spec.file} › ${spec.title}`,
          outcome: OUTCOME[t.status] ?? t.status,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of results.suites ?? []) walk(suite);
  return found;
}

export function formatDuration(ms) {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  return h ? `${h}h ${minutes % 60}m` : `${minutes}m`;
}

const MARK = { passed: "✓", flaky: "~", failed: "✗", skipped: "–" };

/**
 * The tests-by-runs grid as Markdown, plus counts that help read it. Retries
 * bunched in one run point to infrastructure, and one test retried or failed
 * across runs points to the app or the test. They're leads, not verdicts.
 */
export function grid(runs) {
  const tests = [...new Set(runs.flatMap((r) => r.outcomes.map((o) => o.test)))];
  if (tests.length === 0) return "No frozen reports found.";
  const header = `| Test | ${runs.map((r) => r.label).join(" | ")} |`;
  const rule = `| --- | ${runs.map(() => ":-:").join(" | ")} |`;
  const rows = tests.map((test) => {
    const cells = runs.map((r) => MARK[r.outcomes.find((o) => o.test === test)?.outcome] ?? " ");
    return `| ${test} | ${cells.join(" | ")} |`;
  });
  const bad = (o) => o.outcome === "flaky" || o.outcome === "failed";
  const byRun = runs.map((r) => `${r.label}: ${r.outcomes.filter(bad).length}`).join(", ");
  const byTest = tests
    .map((test) => [
      test,
      runs.filter((r) => r.outcomes.some((o) => o.test === test && bad(o))).length,
    ])
    .filter(([, n]) => n > 1)
    .map(([test, n]) => `${test} (${n} runs)`);
  return [
    "✓ passed, ~ passed on retry, ✗ failed, – skipped, blank not run.",
    "",
    header,
    rule,
    ...rows,
    "",
    `- **Retried or failed tests per run:** ${byRun}.`,
    `- **Tests retried or failed in more than one run:** ${byTest.length ? byTest.join(", ") : "none"}.`,
  ].join("\n");
}

/**
 * Attempts so far. A merged PR that was later reverted carries `failed-attempt`
 * too, so it counts as failed, not landed. Nothing landed means no "plus one".
 */
export function attemptTally(prs) {
  const failed = prs.filter((p) => p.labels.includes("failed-attempt"));
  const landed = prs.find((p) => p.merged && !p.labels.includes("failed-attempt")) ?? null;
  return { failed: failed.length, landed, attempts: failed.length + (landed ? 1 : 0) };
}
