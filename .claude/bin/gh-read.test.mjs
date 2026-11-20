import assert from "node:assert/strict";
import { test } from "node:test";
import { ghArgs, readOnlyEnv } from "./gh-read.mjs";

test("each read is a GET to one fixed endpoint", () => {
  assert.deepEqual(ghArgs(["job-log", "134648424662"]), [
    "api",
    "--method",
    "GET",
    "--allow-escape-sequences",
    "repos/{owner}/{repo}/actions/jobs/134648424662/logs",
  ]);
  assert.deepEqual(ghArgs(["blocked-by", "12"]).slice(0, 4), [
    "api",
    "--method",
    "GET",
    "repos/{owner}/{repo}/issues/12/dependencies/blocked_by",
  ]);
  assert.deepEqual(ghArgs(["rate-limit"]), [
    "api",
    "--method",
    "GET",
    "rate_limit",
    "--jq",
    ".resources.core",
  ]);
});

test("refuses anything that could change the request", () => {
  for (const argv of [
    [],
    ["job-log"],
    ["job-log", "12 -X DELETE"],
    ["job-log", "-X"],
    ["job-log", "12", "-X", "POST"],
    ["blocked-by", "../pulls/3/merge"],
    ["blocked-by", "0"],
    ["rate-limit", "-X"],
    ["merge", "3"],
  ])
    assert.throws(() => ghArgs(argv), undefined, JSON.stringify(argv));
});

test("asks the gh wrapper for the read-only token, whatever the caller set", () => {
  assert.deepEqual(readOnlyEnv({ PATH: "/bin" }), { PATH: "/bin", V1BE_GH_READ_ONLY: "1" });
  assert.equal(readOnlyEnv({ V1BE_GH_READ_ONLY: "0" }).V1BE_GH_READ_ONLY, "1");
});
