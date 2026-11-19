// /attempt's CI watch, as one allow rule (`Bash(node .claude/bin/ci-watch.mjs *)`),
// so waiting on CI asks the user nothing. It replaces `until … sleep 60` loops,
// which no allow rule can match. Run it with Bash's run_in_background; it prints
// the run's jobs and exits when the wait is over. Every call is a gh read, and it
// lives under .claude/, a protected path, like gh-read.mjs.
//
//   node .claude/bin/ci-watch.mjs branch-deploy <pr>   until `branch / deploy` or the run ends
//   node .claude/bin/ci-watch.mjs run <pr>             until the PR's run ends
//   node .claude/bin/ci-watch.mjs production <pr>      until the merge commit's run ends
//
// The PR modes watch the newest deploy.yml run for the head commit, and stop if a
// push moves the head: start again from the new commit then. Exit codes: 0 done
// (whatever the run's conclusion), 2 bad arguments, 3 head moved, 4 stranded run
// (queued with no jobs for 15 minutes), other values are gh's own failure.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const POLL_MS = 60_000;
export const STRANDED_MS = 15 * 60_000;
const WATCHED_JOB = "branch / deploy";
const USAGE =
  "Usage: node .claude/bin/ci-watch.mjs branch-deploy <pr> | run <pr> | production <pr>";

// Returns the watch to run, or throws on anything else.
export function parseArgs(argv) {
  const [mode, pr, ...extra] = argv;
  if (extra.length || !["branch-deploy", "run", "production"].includes(mode ?? ""))
    throw new Error(USAGE);
  if (!/^[1-9][0-9]*$/.test(pr ?? ""))
    throw new Error(`The PR must be a number, not "${pr ?? ""}".`);
  return {
    mode,
    pr,
    event: mode === "production" ? "push" : "pull_request",
    commitField: mode === "production" ? "mergeCommit" : "headRefOid",
  };
}

export const prArgs = (pr) => ["pr", "view", pr, "--json", "headRefOid,mergeCommit"];
export const runListArgs = (sha, event) => [
  "run",
  "list",
  "--workflow",
  "deploy.yml",
  "--commit",
  sha,
  "--event",
  event,
  "--limit",
  "1",
  "--json",
  "databaseId",
];
export const runViewArgs = (id) => [
  "run",
  "view",
  String(id),
  "--json",
  "status,conclusion,url,jobs",
];

// The commit a watch follows, from `gh pr view`'s JSON, or null before a merge.
export function commitOf(view, commitField) {
  return commitField === "mergeCommit" ? (view.mergeCommit?.oid ?? null) : view.headRefOid;
}

// What to do after one look at the run: "done", "wait" or "stranded".
export function decide(mode, run, queuedSinceMs, nowMs) {
  if (run.status === "completed") return "done";
  const jobs = run.jobs ?? [];
  if (
    mode === "branch-deploy" &&
    jobs.some((job) => job.name === WATCHED_JOB && job.status === "completed")
  )
    return "done";
  if (run.status === "queued" && jobs.length === 0 && nowMs - queuedSinceMs >= STRANDED_MS)
    return "stranded";
  return "wait";
}

export function summary(id, run) {
  return {
    run: id,
    url: run.url,
    status: run.status,
    conclusion: run.conclusion,
    jobs: (run.jobs ?? []).map((job) => ({
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
    })),
  };
}

const gh = (args) => JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function watch({ mode, pr, event, commitField }) {
  let sha = commitOf(gh(prArgs(pr)), commitField);
  while (!sha) {
    await sleep(POLL_MS);
    sha = commitOf(gh(prArgs(pr)), commitField);
  }
  const headMoved = () =>
    commitField === "headRefOid" && commitOf(gh(prArgs(pr)), commitField) !== sha;

  let id = gh(runListArgs(sha, event))[0]?.databaseId;
  while (!id) {
    if (headMoved())
      return {
        code: 3,
        message: `PR #${pr}'s head moved off ${sha}. Start again from the new commit.`,
      };
    await sleep(POLL_MS);
    id = gh(runListArgs(sha, event))[0]?.databaseId;
  }
  process.stdout.write(`Watching run ${id} for ${sha}.\n`);

  let queuedSince = Date.now();
  for (;;) {
    const run = gh(runViewArgs(id));
    if (run.status !== "queued" || (run.jobs ?? []).length > 0) queuedSince = Date.now();
    const next = decide(mode, run, queuedSince, Date.now());
    if (next === "done") return { code: 0, message: JSON.stringify(summary(id, run), null, 2) };
    if (next === "stranded")
      return {
        code: 4,
        message: `Run ${id} has been queued with no jobs for 15 minutes: GitHub stranded it. Push an empty commit that says why.`,
      };
    if (headMoved())
      return {
        code: 3,
        message: `PR #${pr}'s head moved off ${sha}. Start again from the new commit.`,
      };
    await sleep(POLL_MS);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`ci-watch: ${error.message}\n`);
    process.exit(2);
  }
  try {
    const { code, message } = await watch(options);
    process.stdout.write(`${message}\n`);
    process.exit(code);
  } catch (error) {
    process.stderr.write(`ci-watch: ${error.message}\n`);
    process.exit(error.status ?? 1);
  }
}
