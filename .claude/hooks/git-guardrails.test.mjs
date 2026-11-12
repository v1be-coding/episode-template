import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { problem } from "./git-guardrails.mjs";

const onBranch = (name) => () => name;

const blocked = [
  ["git push origin main", "feature"],
  ["git push origin HEAD:main", "feature"],
  ["git push origin HEAD", "main"],
  ["git push origin refs/heads/main", "feature"],
  ["git push origin :main", "feature"],
  ["git push --delete origin main", "feature"],
  ["git push", "main"],
  ["git push origin", "main"],
  ["git push --force origin feature", "feature"],
  ["git push -f origin feature", "feature"],
  ["git push -uf origin feature", "feature"],
  ["git push --force-with-lease origin feature", "feature"],
  ["git push origin +feature", "feature"],
  ["git push --mirror", "feature"],
  ["git -C ../repo push origin main", "feature"],
  ["git -c core.x=y push origin main", "feature"],
  ["GIT_TERMINAL_PROMPT=0 git push origin main", "feature"],
  ["npm test && git push origin main", "feature"],
  ["git status; git reset --hard origin/main", "feature"],
  ["git reset --hard", "feature"],
  ["git clean -fd", "feature"],
  ["git clean -xdf", "feature"],
  ["git clean --force", "feature"],
  ["git branch -D attempt-2", "feature"],
  ["git branch -df attempt-2", "feature"],
  ["git branch --delete --force attempt-2", "feature"],
  ["git branch -D ticket-43 attempt-1", "feature"],
  ["git commit -m x; git push -u origin feature", "feature"],
  ["git commit -m x\ngit push -u origin feature", "feature"],
  ["git add . && git commit -m x; gh pr create --fill", "feature"],
  ["git commit -m x || true; git push", "feature"],
  ["git commit -m x & git push", "feature"],
  ["git commit -m x && npm test; gh pr create --fill", "feature"],
  ["gh pr merge 12", "feature"],
  ["gh pr merge 12 --squash", "feature"],
  ["gh pr merge 12 --admin --squash", "feature"],
];

const allowed = [
  ["git push origin feature", "feature"],
  ["git push -u origin feature", "feature"],
  ["git push", "feature"],
  ["git push origin HEAD", "feature"],
  ["git push origin feature:feature", "feature"],
  ["git reset --soft HEAD~1", "feature"],
  ["git reset", "feature"],
  ["git clean -n", "feature"],
  ["git branch -d merged", "feature"],
  ["git branch -D ticket-43", "feature"],
  ["git branch -D worktree-agent-abc123", "feature"],
  ["git commit -m x && git push -u origin feature && gh pr create --fill", "feature"],
  ["git commit -m x && (git push -u origin feature)", "feature"],
  ["set -euo pipefail\ngit commit -m x\ngit push -u origin feature", "feature"],
  ["git push origin feature; git commit -m x", "feature"],
  ["git commit -m x; git log -1", "feature"],
  ["git commit -m 'fix; then push'", "feature"],
  ["git branch feature-2", "feature"],
  ["gh pr merge 12 --auto --squash", "feature"],
  ["git log --grep 'push origin main'", "feature"],
  ['echo "git reset --hard"', "feature"],
  ["git commit -m 'never git push --force'", "feature"],
  ["git switch main", "feature"],
  ["git pull --ff-only", "main"],
];

for (const [command, branch] of blocked) {
  test(`blocks: ${command} (on ${branch})`, () => {
    assert.ok(problem(command, onBranch(branch)));
  });
}

for (const [command, branch] of allowed) {
  test(`allows: ${command} (on ${branch})`, () => {
    assert.equal(problem(command, onBranch(branch)), null);
  });
}

test("the hook exits 2 with a reason when it blocks, and 0 otherwise", () => {
  const hook = fileURLToPath(new URL("./git-guardrails.mjs", import.meta.url));
  const run = (command) =>
    spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ tool_input: { command } }),
      encoding: "utf8",
    });
  const no = run("gh pr merge 3");
  assert.equal(no.status, 2);
  assert.match(no.stderr, /--auto/);
  assert.equal(run("git status").status, 0);
});
