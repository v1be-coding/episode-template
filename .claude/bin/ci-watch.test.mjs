import assert from "node:assert/strict";
import { test } from "node:test";
import { STRANDED_MS, commitOf, decide, parseArgs, runListArgs, runViewArgs } from "./ci-watch.mjs";

test("reads the three watches, and which commit and event each follows", () => {
  assert.deepEqual(parseArgs(["branch-deploy", "12"]), {
    mode: "branch-deploy",
    pr: "12",
    event: "pull_request",
    commitField: "headRefOid",
  });
  assert.equal(parseArgs(["run", "12"]).event, "pull_request");
  assert.deepEqual(parseArgs(["production", "12"]), {
    mode: "production",
    pr: "12",
    event: "push",
    commitField: "mergeCommit",
  });
});

test("refuses anything else", () => {
  for (const argv of [
    [],
    ["run"],
    ["run", "0"],
    ["run", "12 --repo x/y"],
    ["run", "12", "--repo", "x/y"],
    ["watch", "12"],
    ["branch-deploy", "-R"],
  ])
    assert.throws(() => parseArgs(argv), undefined, argv.join(" "));
});

test("finds the newest deploy.yml run for the commit and event", () => {
  assert.deepEqual(runListArgs("abc123", "push"), [
    "run",
    "list",
    "--workflow",
    "deploy.yml",
    "--commit",
    "abc123",
    "--event",
    "push",
    "--limit",
    "1",
    "--json",
    "databaseId",
  ]);
  assert.deepEqual(runViewArgs(42).slice(0, 3), ["run", "view", "42"]);
});

test("follows the head commit, or the merge commit once there is one", () => {
  const view = { headRefOid: "head", mergeCommit: null };
  assert.equal(commitOf(view, "headRefOid"), "head");
  assert.equal(commitOf(view, "mergeCommit"), null);
  assert.equal(commitOf({ ...view, mergeCommit: { oid: "merge" } }, "mergeCommit"), "merge");
});

test("branch-deploy ends when its job does, the other watches only with the run", () => {
  const run = {
    status: "in_progress",
    jobs: [
      { name: "branch / deploy", status: "completed", conclusion: "success" },
      { name: "checklist", status: "waiting" },
    ],
  };
  assert.equal(decide("branch-deploy", run, 0, 0), "done");
  assert.equal(decide("run", run, 0, 0), "wait");
  assert.equal(decide("run", { ...run, status: "completed" }, 0, 0), "done");
  assert.equal(
    decide(
      "branch-deploy",
      { status: "in_progress", jobs: [{ name: "branch / deploy", status: "in_progress" }] },
      0,
      0,
    ),
    "wait",
  );
});

test("a run queued with no jobs for 15 minutes is stranded", () => {
  const queued = { status: "queued", jobs: [] };
  assert.equal(decide("run", queued, 0, STRANDED_MS - 1), "wait");
  assert.equal(decide("run", queued, 0, STRANDED_MS), "stranded");
  assert.equal(
    decide(
      "run",
      { status: "queued", jobs: [{ name: "rounds", status: "queued" }] },
      0,
      STRANDED_MS,
    ),
    "wait",
  );
});
