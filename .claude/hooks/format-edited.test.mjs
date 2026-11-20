import assert from "node:assert/strict";
import { test } from "node:test";
import { target } from "./format-edited.mjs";

const input = (file_path) => ({ tool_name: "Edit", tool_input: { file_path } });
const gitAt =
  (...dirs) =>
  (p) =>
    dirs.some((d) => p === `${d}/.git`);
const exists = gitAt("/repo", "/repo/.claude/worktrees/agent-1");

test("formats a file in the checkout that holds it", () => {
  assert.deepEqual(target(input("/repo/src/api/handler.ts"), exists), {
    root: "/repo",
    file: "src/api/handler.ts",
  });
  assert.deepEqual(target(input("/repo/.claude/worktrees/agent-1/src/x.ts"), exists), {
    root: "/repo/.claude/worktrees/agent-1",
    file: "src/x.ts",
  });
});

test("skips frozen/, node_modules, relative paths and files in no checkout", () => {
  for (const file of [
    "/repo/frozen/acceptance/a.spec.ts",
    "/repo/.claude/worktrees/agent-1/frozen/a.spec.ts",
    "/repo/node_modules/x/index.js",
    "/elsewhere/x.ts",
    "src/x.ts",
  ]) {
    assert.equal(target(input(file), exists), null, file);
  }
  assert.equal(target({ tool_input: {} }, exists), null);
});
