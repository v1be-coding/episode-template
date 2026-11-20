// Times requests to a PR's branch environment, as one allow rule
// (`Bash(node .claude/bin/time-requests.mjs *)`), for when a frozen test fails on
// latency. A `curl` rule would let any request reach any host, so this script
// calls only the branch URL in the PR's checklist comment, posted by a trusted
// author. All requests share one kept-alive connection, so the first shows the
// cost of a new connection and the rest show a warm one. Lives under .claude/, a
// protected path, like gh-read.mjs.
//
//   node .claude/bin/time-requests.mjs <pr> <path> [--count <n>] [--method GET|POST]
//     [--header "<name>: <value>"]... [--body <json>]
//
// Prints connect, first-byte and total milliseconds per request, and each status.
import { execFileSync } from "node:child_process";
import https from "node:https";
import { pathToFileURL } from "node:url";

const TRUSTED = new Set(["emilianocasijr", "v1be-agent", "github-actions"]);
const BRANCH_URL = /https:\/\/[a-z0-9]+\.cloudfront\.net\b/;
const MAX_COUNT = 30;
const USAGE =
  'Usage: node .claude/bin/time-requests.mjs <pr> <path> [--count <n>] [--method GET|POST] [--header "<name>: <value>"]... [--body <json>]';

// Returns the requests to make, or throws on anything else.
export function parseArgs(argv) {
  const [pr, path, ...rest] = argv;
  if (!/^[1-9][0-9]*$/.test(pr ?? "")) throw new Error(USAGE);
  if (!/^\/[^\s\\]*$/.test(path ?? "") || path.startsWith("//"))
    throw new Error(`The path must start with one "/", not "${path ?? ""}".`);
  const options = { pr, path, count: 3, method: "GET", headers: {}, body: undefined };
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = [rest[i], rest[i + 1]];
    if (value === undefined) throw new Error(USAGE);
    if (flag === "--count") {
      const count = Number(value);
      if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT)
        throw new Error(`--count must be 1 to ${MAX_COUNT}.`);
      options.count = count;
    } else if (flag === "--method") {
      if (!["GET", "POST"].includes(value)) throw new Error("--method must be GET or POST.");
      options.method = value;
    } else if (flag === "--header") {
      const match = /^([A-Za-z0-9-]+):\s*(.*)$/.exec(value);
      if (!match) throw new Error(`--header must look like "name: value", not "${value}".`);
      options.headers[match[1].toLowerCase()] = match[2];
    } else if (flag === "--body") {
      options.body = value;
    } else throw new Error(USAGE);
  }
  if (options.body !== undefined && options.method !== "POST")
    throw new Error("--body needs --method POST.");
  return options;
}

const login = (author) => (author?.login ?? "").replace(/\[bot\]$/, "");

// The branch URL from the newest trusted comment that names one.
export function branchUrl(comments) {
  for (const comment of [...comments].reverse()) {
    if (!TRUSTED.has(login(comment.author))) continue;
    const match = BRANCH_URL.exec(comment.body ?? "");
    if (match) return match[0];
  }
  return null;
}

function timeOne(agent, url, { method, headers, body }) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    let connect = 0;
    let firstByte = 0;
    const request = https.request(url, { agent, method, headers }, (response) => {
      firstByte = performance.now() - start;
      response.resume();
      response.on("end", () =>
        resolve({
          status: response.statusCode,
          connect,
          firstByte,
          total: performance.now() - start,
        }),
      );
    });
    request.on("socket", (socket) => {
      if (!socket.connecting) return;
      socket.once("secureConnect", () => (connect = performance.now() - start));
    });
    request.on("error", reject);
    if (body !== undefined) {
      request.setHeader("content-type", headers["content-type"] ?? "application/json");
      request.write(body);
    }
    request.end();
  });
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`time-requests: ${error.message}\n`);
    process.exit(2);
  }
  const { comments } = JSON.parse(
    execFileSync("gh", ["pr", "view", options.pr, "--json", "comments"], { encoding: "utf8" }),
  );
  const base = branchUrl(comments);
  if (!base) {
    process.stderr.write(
      `time-requests: PR #${options.pr} has no checklist comment with a branch URL yet.\n`,
    );
    process.exit(1);
  }
  const url = new URL(options.path, base);
  if (url.origin !== new URL(base).origin) {
    process.stderr.write(`time-requests: ${options.path} leaves the branch environment.\n`);
    process.exit(2);
  }
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  process.stdout.write(`${options.method} ${url}\n`);
  for (let n = 1; n <= options.count; n += 1) {
    const r = await timeOne(agent, url, options);
    const connect = r.connect ? `${Math.round(r.connect)} ms` : "reused";
    process.stdout.write(
      `${n}: ${r.status}  connect ${connect}  first byte ${Math.round(r.firstByte)} ms  total ${Math.round(r.total)} ms\n`,
    );
  }
  agent.destroy();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`time-requests: ${error.message}\n`);
    process.exit(1);
  });
}
