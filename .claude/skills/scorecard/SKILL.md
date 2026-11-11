---
name: scorecard
description: "Build an episode's scorecard for a spec issue from GitHub: time to green, attempts, frozen tests passing on attempt 1, and a tests-by-runs grid, plus the judgment items. Run after the episode lands, before /retro."
disable-model-invocation: true
argument-hint: <spec issue number>
---

Build the scorecard for spec issue #$ARGUMENTS. The series publishes it on the episode's page, so every number must come from GitHub or from the user, never from memory or estimates (Q28 in the series' decisions, and `V1BE_CODING.md`: Scorecard).

## 1. Run the script

```sh
node .claude/skills/scorecard/scripts/scorecard.mjs $ARGUMENTS
```

It reads GitHub only and prints Markdown. What it measures:

| Measure                           | From                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time to green                     | The `Attempt <n> started at` comment `/attempt` posts on the spec, to `green` passing on the landed PR, minus time `checklist` and `cost-approval` waited for the user |
| Attempts                          | PRs from `attempt-<spec>-<n>` branches labelled `failed-attempt`, plus one                                                                                             |
| Frozen tests passing on attempt 1 | The first CI run of attempt 1. A test that passed on retry counts (Q40)                                                                                                |
| Grid                              | Every run's `frozen-reports` artifact, kept 90 days. Run the scorecard within that time                                                                                |

If a number comes out as unknown, say why rather than filling it in. For example, a missing start comment means `/attempt` skipped its first step, which is a finding for `/retro`.

## 2. Read the grid

The grid shows each frozen test's outcome in each run. The counts under it are leads, not verdicts:

- **Retries or failures bunched in one run** point to infrastructure, such as a cold start or a throttle.
- **One test retried or failing across runs** points to the app or the test.

Open the run's retry report (the PR comment starting `<!-- frozen-retry-report -->`, or `retry-report.md` in the artifact) before calling either. Each test in it carries a hint (`infra-looking`, `app-looking` or `unclear`) and the evidence behind it.

## 3. Add the judgment items

These need a person, so ask the user for anything GitHub can't show:

- **Build cost** and **model used:** ask the user. Claude Code shows them, and the repo doesn't.
- **What the spec missed:** read the comments each failed attempt left on the spec issue, and any stop over a frozen test. Summarise in one line each.
- **Frozen tests that turned out wrong:** the script lists PRs that changed `frozen/` after attempt 1 began. For each, read it and decide with the user whether it fixed a wrong test, which counts, or only added coverage, which doesn't (Q30).

## 4. Publish

Show the user the finished scorecard. Once they agree, post it as a comment on the spec issue, so it's public and stays with the spec. Then they can run `/retro`.
