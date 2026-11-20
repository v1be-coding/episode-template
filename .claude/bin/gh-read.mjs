// The GitHub reads a run needs that have no gh subcommand, as one allow rule
// (`Bash(node .claude/bin/gh-read.mjs *)`). An allow rule on `gh api …` can't be made
// read-only, as its wildcard also matches -X and -f flags. Here every call is a
// GET with numeric IDs, so no argument can turn it into a write. It lives under
// .claude/, a protected path, so auto mode can't approve an edit to it unreviewed
// (Claude Code docs, "Protected paths" under permission modes). It also sets
// V1BE_GH_READ_ONLY=1, and the container's gh wrapper then signs in with a token
// that can only read Actions and Issues (v1be-infra #69). So even a flaw here
// can't write.
//
//   node .claude/bin/gh-read.mjs job-log <job id>      a CI job's log, even while others wait
//   node .claude/bin/gh-read.mjs blocked-by <issue>    the issues blocking a ticket
//   node .claude/bin/gh-read.mjs rate-limit            the core API rate limit
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const id = (value, what) => {
  if (!/^[1-9][0-9]*$/.test(value ?? ""))
    throw new Error(`${what} must be a number, not "${value ?? ""}".`);
  return value;
};

// gh's environment: the caller's, asking the wrapper for the read-only token.
export const readOnlyEnv = (env) => ({ ...env, V1BE_GH_READ_ONLY: "1" });

// Returns gh's arguments for a request, or throws on anything else.
// {owner}/{repo} is filled in by gh from the checkout's remote.
export function ghArgs(argv) {
  const [read, value, ...extra] = argv;
  if (extra.length) throw new Error("Too many arguments.");
  const get = ["api", "--method", "GET"];
  if (read === "job-log")
    return [
      ...get,
      "--allow-escape-sequences",
      `repos/{owner}/{repo}/actions/jobs/${id(value, "The job id")}/logs`,
    ];
  if (read === "blocked-by")
    return [
      ...get,
      `repos/{owner}/{repo}/issues/${id(value, "The issue number")}/dependencies/blocked_by`,
      "--jq",
      '.[] | "#\\(.number) \\(.state) \\(.title)"',
    ];
  if (read === "rate-limit" && value === undefined)
    return [...get, "rate_limit", "--jq", ".resources.core"];
  throw new Error(
    "Usage: node .claude/bin/gh-read.mjs job-log <job id> | blocked-by <issue> | rate-limit",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let args;
  try {
    args = ghArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`gh-read: ${error.message}\n`);
    process.exit(2);
  }
  try {
    execFileSync("gh", args, { stdio: "inherit", env: readOnlyEnv(process.env) });
  } catch (error) {
    process.exit(error.status ?? 1);
  }
}
