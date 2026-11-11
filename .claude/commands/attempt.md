---
description: Build a spec in one run and land it through the required check
argument-hint: <spec issue number>
disable-model-invocation: true
---

Run one attempt at spec issue #$ARGUMENTS: build it, land it through auto-merge and see production pass. The rules behind each step are in `V1BE_CODING.md` and ADR-0013 in `v1be-coding/series`.

Run this in an interactive session, not `claude -p`: CI waits can outlast a background command's time limit there.

**Rules for the whole run:**

- No human input except the approvals GitHub asks the user for. Don't stop to ask whether to continue.
- Never edit `frozen/` or `.github/`. CI runs `frozen/` from the base commit, so an edit changes nothing except blocking the merge for code owner review.
- **The test contract in the spec issue and the tests in `frozen/acceptance/` define done.** Read both before building. Write a general solution, not one shaped to the values in the tests: the user checks the branch with their own.
- **If a frozen test looks wrong, stop.** Never change the app's behaviour just to make a test pass. Go to [Stop over a frozen test](#stop-over-a-frozen-test).
- Never merge by hand, and never close an issue by hand. GitHub merges when `green` passes, and the PR's `Closes` lines close the spec and tickets.
- **If the conversation was compacted,** re-read this file and `.claude/skills/implement-spec/SKILL.md`, then rebuild where you are from the PR, the branch's `git log` and the spec issue's comments.

## 1. Start

1. Count earlier attempts by branch name:

   ```sh
   gh pr list --state all --label failed-attempt --json headRefName \
     --jq '[.[] | select(.headRefName | test("^attempt-$ARGUMENTS-[0-9]+$"))] | length'
   ```

   This attempt is that number plus one. At 3 earlier attempts, stop: the series allows no more. Also stop if an `attempt-$ARGUMENTS-*` PR is still open, because another attempt is running.

2. Comment on the spec issue: `Attempt <n> started at <UTC time, ISO 8601>.` The scorecard measures time to green from this comment.
3. Start from an up-to-date `main`. The integration branch is `attempt-$ARGUMENTS-<n>`, which must be new: CI counts failed rounds by branch name.

## 2. Build

Read `.claude/skills/implement-spec/SKILL.md` and follow it, with spec issue #$ARGUMENTS and the integration branch above. It can't be started as a skill, so read it and do what it says, with these settings for this run:

- **Open the draft PR in its step 3.** This run asks for one. The PR body closes the spec and every ticket with `Closes #<n>` lines.
- **Seams are already confirmed.** The seams named in the tickets and the test contract count as confirmed for `tdd`, so implementers don't ask the user.
- **No hard resets.** An implementer whose worktree isn't on the integration branch runs `git switch -C <its branch> <integration branch>`. The guardrail blocks `git reset --hard`.
- **`code-review`'s fixed point is `main`.**
- If the spec lists seed rows in its test contract, add them to `src/db/seed-data.ts`.

## 3. Land

1. Mark the PR ready with `gh pr ready <pr>`, if `implement-spec` hasn't already. A draft PR fails `green` by design.
2. Turn on auto-merge with exactly `gh pr merge <pr> --auto --squash`. The allow rule matches that word order only.

## 4. Watch CI and fix it

Wait with Bash's `run_in_background`, which tells you when the command exits:

```sh
gh pr checks <pr> --watch --fail-fast --interval 60
```

Don't use `gh run watch`, which this container's `gh` refuses, or the Monitor tool, whose watches end within 30 minutes. Never use a foreground `sleep`.

- **The checklist comment:** once the first `branch / deploy` job passes, comment on the PR once. The URL stays the same for later pushes.
  - The branch URL, from the line `Branch environment: <url>` in that job's log.
  - The spec's product checklist, copied as a task list.
  - `Try your own values, not the ones in the tests.`
- **Logs:** `gh api --allow-escape-sequences repos/<repo>/actions/jobs/<id>/logs`. `gh run view --log` returns nothing while any job is still waiting, such as `checklist`.
- **Frozen test failures:** the PR comment starting `<!-- frozen-retry-report -->` lists each failed or retried test with a hint. The hint is a lead, not a verdict.
- **One push per failed run.** Runs don't cancel each other, so every run that fails counts as a round, including one still going when you push. Read every failure in the run, fix them together, then push once. You can't rerun a job, so a temporary failure also needs a push, such as an empty commit that says why.
- **Rounds:** the `rounds` job prints `Failed rounds before this run: N of 5.` If a run fails after that line said `4 of 5`, the attempt is over: go to [Fail the attempt](#fail-the-attempt) without pushing again.
- **Waiting for the user** isn't a failure. Keep waiting.
  - A `checklist` or `cost-approval` job that **failed** means the user rejected it, and the attempt has failed.
  - One that was **cancelled** was replaced by a newer push.

## 5. Watch production

After the merge, wait in the background for the `deploy.yml` run on the merge commit:

```sh
sha=$(gh pr view <pr> --json mergeCommit --jq .mergeCommit.oid)
until id=$(gh run list --workflow deploy.yml --commit "$sha" --event push --json databaseId --jq '.[0].databaseId // empty') && [ -n "$id" ]; do sleep 60; done
until [ "$(gh run view "$id" --json status --jq .status)" = completed ]; do sleep 60; done
gh run view "$id" --json conclusion,url
```

`sleep` is fine inside this background loop. A café run waits here for the user's `production` approval.

- **If production passes,** comment on the spec issue with the PR, the run and `Attempt <n> landed.` Then report.
- **If production fails,** open a fix PR from a new branch, `fix-$ARGUMENTS-<n>`, and land it as in steps 3 and 4. It gets its own 5 rounds. A café fix also waits for the user's `production` approval.
- **If the fix PR runs out of rounds, or the user rejects one of its approvals,** revert: from a new branch, `revert-$ARGUMENTS-<n>`, run `git revert <merge sha>` (a squash merge has one parent) and land that PR the same way. Then:
  1. Reopen the spec and every ticket the attempt closed. GitHub doesn't reopen them on a revert.
  2. Label the merged attempt PR `failed-attempt`, and comment on the spec issue as in [Fail the attempt](#fail-the-attempt), without closing anything.
- **If the revert PR fails too,** stop and report. That's the one case that needs the user.

## Stop over a frozen test

When a frozen test looks wrong, for example it contradicts the spec or its contract line, or two tests can't both pass:

1. Comment on the spec issue. Name the test file and title, quote the assertion, quote the contract line it conflicts with, and say why both can't hold.
2. Fail the attempt as below. A spec PR fixes the test before the next attempt.

## Fail the attempt

1. Comment on the spec issue: what failed, with links to the run and the PR, and what the spec seems to have missed.
2. Close the PR with the `failed-attempt` label, and keep the branch: `gh pr close <pr> --comment "<one line why>"`, then `gh pr edit <pr> --add-label failed-attempt`. Closing the PR destroys its branch environment.

## Report

End with a short report for the user: the outcome, links to the PR and the runs, the rounds used, and anything left for them to do.
