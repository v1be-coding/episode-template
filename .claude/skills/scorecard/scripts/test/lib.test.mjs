import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  approvalWaitMs,
  attemptOfBranch,
  attemptStarts,
  formatDuration,
  greenAt,
  grid,
  outcomes,
} from "../lib.mjs";

// Trimmed from real frozen-reports: #33's passing run and #34's broken page.
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), "utf8"));
const t = (iso) => Date.parse(iso);
const job = (name, created, completed, conclusion = "success") => ({
  name,
  created_at: created,
  completed_at: completed,
  conclusion,
});

test("reads attempt starts from /attempt's comments, first one per attempt", () => {
  const starts = attemptStarts([
    { body: "Looks good" },
    { body: "Attempt 1 started at 2026-11-12T01:00:00Z." },
    { body: "Attempt 2 started at 2026-11-12T05:00:00Z." },
    { body: "Attempt 1 started at 2026-11-12T09:00:00Z." },
    { body: "Attempt 3 started at sometime." },
  ]);
  assert.deepEqual(starts, [
    { attempt: 1, at: t("2026-11-12T01:00:00Z") },
    { attempt: 2, at: t("2026-11-12T05:00:00Z") },
  ]);
});

test("finds the attempt number in attempt-<spec>-<n> branches only", () => {
  assert.equal(attemptOfBranch("attempt-12-2", 12), 2);
  assert.equal(attemptOfBranch("attempt-123-2", 12), null);
  assert.equal(attemptOfBranch("fix-12-1", 12), null);
});

test("counts approval waits once when they overlap, and ignores other jobs", () => {
  const from = t("2026-11-12T00:00:00Z");
  const to = t("2026-11-12T03:00:00Z");
  const jobs = [
    job("checklist", "2026-11-12T01:00:00Z", "2026-11-12T01:30:00Z", "cancelled"), // replaced by a new push
    job("checklist", "2026-11-12T01:20:00Z", "2026-11-12T02:00:00Z"),
    job("cost-approval", "2026-11-12T00:10:00Z", "2026-11-12T00:20:00Z"),
    job("branch / deploy", "2026-11-12T00:20:00Z", "2026-11-12T00:50:00Z"), // a queue, not an approval
    job("cost-approval", "2026-11-12T00:00:00Z", "2026-11-12T00:00:00Z", "skipped"),
  ];
  assert.equal(approvalWaitMs(jobs, from, to), 70 * 60_000);
});

test("clips approval waits to the measured window", () => {
  const jobs = [job("checklist", "2026-11-12T01:00:00Z", "2026-11-12T03:00:00Z")];
  assert.equal(
    approvalWaitMs(jobs, t("2026-11-12T02:00:00Z"), t("2026-11-12T02:30:00Z")),
    30 * 60_000,
  );
});

test("#33's run: the checklist wait matches its created-to-completed span", () => {
  // From run 42983471644: checklist created 08:08:09, approved 08:24:36, done 08:24:39.
  const jobs = [job("checklist", "2026-11-11T08:08:09Z", "2026-11-11T08:24:39Z")];
  const wait = approvalWaitMs(jobs, t("2026-11-11T07:59:09Z"), t("2026-11-11T08:24:44Z"));
  assert.equal(wait, (16 * 60 + 30) * 1000);
});

test("finds when green passed, and null when it didn't", () => {
  assert.equal(
    greenAt([job("green", "2026-11-12T01:00:00Z", "2026-11-12T01:00:05Z")]),
    t("2026-11-12T01:00:05Z"),
  );
  assert.equal(
    greenAt([job("green", "2026-11-12T01:00:00Z", "2026-11-12T01:00:05Z", "failure")]),
    null,
  );
});

test("reads each test's outcome from a real Playwright report", () => {
  assert.deepEqual(outcomes(fixture("failed")), [
    { test: "smoke/smoke.spec.ts › the page loads in a real browser", outcome: "passed" },
    { test: "smoke/smoke.spec.ts › the API answers through the page", outcome: "failed" },
    { test: "smoke/smoke.spec.ts › a write and a read reach the database", outcome: "passed" },
    {
      test: "smoke/rate-limit.spec.ts › going over the per-IP limit gives a handled 429",
      outcome: "skipped",
    },
  ]);
});

test("formats durations in hours and minutes", () => {
  assert.equal(formatDuration(25 * 60_000), "25m");
  assert.equal(formatDuration(125 * 60_000), "2h 5m");
});

test("draws the grid, with a test failing across runs called out", () => {
  const flaky = outcomes(fixture("passed")).map((o, i) =>
    i === 0 ? { ...o, outcome: "flaky" } : o,
  );
  const md = grid([
    { label: "A1·1", outcomes: outcomes(fixture("failed")) },
    { label: "A1·2", outcomes: outcomes(fixture("failed")) },
    { label: "A1·3", outcomes: flaky },
  ]);
  assert.match(md, /\| Test \| A1·1 \| A1·2 \| A1·3 \|/);
  assert.match(
    md,
    /\| smoke\/smoke\.spec\.ts › the API answers through the page \| ✗ \| ✗ \| ✓ \|/,
  );
  assert.match(
    md,
    /\| smoke\/smoke\.spec\.ts › the page loads in a real browser \| ✓ \| ✓ \| ~ \|/,
  );
  assert.match(md, /per run:\*\* A1·1: 1, A1·2: 1, A1·3: 1\./);
  assert.match(
    md,
    /more than one run:\*\* smoke\/smoke\.spec\.ts › the API answers through the page \(2 runs\)\./,
  );
});

test("says so when there are no reports", () => {
  assert.equal(grid([]), "No frozen reports found.");
});
