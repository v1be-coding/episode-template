---
description: Build a spec in one run and land it through the required check
argument-hint: <spec issue number>
---

Run one attempt at spec issue #$ARGUMENTS: build it, land it through auto-merge and see production pass. The rules behind each step are in `V1BE_CODING.md` and ADR-0013 in `v1be-coding/series`.

**Rules for the whole run:**

- No human input except the approvals GitHub asks the user for. Don't stop to ask whether to continue.
- Never edit `frozen/` or `.github/`. CI runs `frozen/` from the base commit, so an edit changes nothing except blocking the merge for code owner review.
- **If a frozen test looks wrong, stop.** Never change the app's behaviour just to make a test pass. Go to [Stop over a frozen test](#stop-over-a-frozen-test).
- Never merge by hand. GitHub merges when `green` passes.

## 1. Start

1. Count earlier attempts: `gh pr list --state closed --label failed-attempt --search "#$ARGUMENTS" --json number --jq length`. This attempt is that number plus one. At 3 earlier attempts, stop: the series allows no more.
2. Comment on the spec issue: `Attempt <n> started at <UTC time, ISO 8601>.` The scorecard measures time to green from this comment.
3. Start from an up-to-date `main`. The integration branch is `attempt-$ARGUMENTS-<n>`, which must be new: CI counts failed rounds by branch name.

## 2. Build

Read `.claude/skills/implement-spec/SKILL.md` and follow it, with spec issue #$ARGUMENTS and the integration branch above. It can't be started as a skill, so read it and do what it says. The PR body must close the spec and every ticket with `Closes #<n>` lines.

## 3. Land

1. Mark the PR ready (`gh pr ready`). A draft PR fails `green` by design.
2. Turn on auto-merge: `gh pr merge <pr> --auto --squash`.
3. Comment on the PR, for the user's checklist approval:
   - The branch URL. Once the `branch / deploy` job finishes, its log has a line `Branch environment: <url>`.
   - The spec's product checklist, copied as a task list.
   - `Try your own values, not the ones in the tests.`

## 4. Watch CI and fix it

Wait for runs of `deploy.yml` on the PR with a background loop, never a foreground `sleep`.

- **Logs:** `gh api --allow-escape-sequences repos/<repo>/actions/jobs/<id>/logs`. `gh run view --log` returns nothing while any job is still waiting, such as `checklist`.
- **Rounds:** the `rounds` job prints `Failed rounds before this run: N of 5.` CI ends the attempt at 5, so you don't need to count.
- **Frozen test failures:** the PR comment starting `<!-- frozen-retry-report -->` lists each failed or retried test with a hint. The hint is a lead, not a verdict.
- **Fix** with a new commit and an ordinary push. You can't rerun a job, so a temporary failure also needs a push, such as an empty commit that says why.
- **Waiting for the user** (`cost-approval` or `checklist`) isn't a failure. Keep waiting.

The attempt fails if the user rejects an approval, or the `rounds` job fails at 5. Then go to [Fail the attempt](#fail-the-attempt).

## 5. Watch production

After the merge, find the `deploy.yml` run for the merge commit on `main` and wait for it.

- **If production passes**, comment on the spec issue with the PR, the run and `Attempt <n> landed.` You're done.
- **If production fails,** open a fix PR from a new branch, `fix-$ARGUMENTS-<n>`, and land it as in steps 3 and 4. It gets its own 5 rounds. A café fix also waits for the user's `production` approval.
- **If the fix PR runs out of rounds,** open a revert PR of the merge commit from a new branch and land it the same way. Then reopen the spec and every ticket the attempt closed, because GitHub doesn't reopen them on a revert. The attempt has failed.

## Stop over a frozen test

When a frozen test looks wrong, for example it contradicts the spec or its contract line, or two tests can't both pass:

1. Comment on the spec issue. Name the test file and title, quote the assertion, quote the contract line it conflicts with, and say why both can't hold.
2. Fail the attempt as below. A spec PR fixes the test before the next attempt.

## Fail the attempt

1. Comment on the spec issue: what failed, with links to the run and the PR, and what the spec seems to have missed.
2. Close the PR with the `failed-attempt` label, and keep the branch: `gh pr close <pr> --comment "<one line why>"`, then `gh pr edit <pr> --add-label failed-attempt`. Closing the PR destroys its branch environment.
