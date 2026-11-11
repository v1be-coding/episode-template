import assert from "node:assert/strict";
import { test } from "node:test";
import { projectsFor } from "../projects.ts";

const names = (target: string | undefined) => projectsFor(target).map((p) => p.name);

test("a branch runs smoke, then acceptance, then the rate-limit check", () => {
  assert.deepEqual(names("branch"), ["smoke", "acceptance", "rate-limit"]);
  assert.deepEqual(projectsFor("branch").at(-1)?.dependencies, ["smoke", "acceptance"]);
});

test("an unset target, as in a local run, counts as a branch", () => {
  assert.deepEqual(names(undefined), ["smoke", "acceptance", "rate-limit"]);
});

test("production leaves acceptance tests out (Q29)", () => {
  assert.deepEqual(names("production"), ["smoke", "rate-limit"]);
  assert.deepEqual(projectsFor("production").at(-1)?.dependencies, ["smoke"]);
});
