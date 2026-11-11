---
description: Write the test contract and frozen tests for a spec issue, then open the frozen PR
argument-hint: <spec issue number>
---

Write the frozen tests for spec issue #$ARGUMENTS. A run is judged by these tests and can't change them, so they decide whether an attempt passes (ADR-0013 in `v1be-coding/series`).

Read **only** the spec issue and its comments, the tickets it links, `frozen/` and `docs/agents/`. Don't read the app's code or earlier attempts: the tests must come from the spec, not from how something happens to be built (Q29). If this session already holds other context, stop and ask for a fresh session.

## 1. Write the test contract

Add a `## Test contract` section to the end of the spec issue's body, with `gh issue edit`. Number each line `C1`, `C2` and so on, and cover only what the spec states:

- **Routes:** method, path, and request and response shapes, with status codes.
- **Page:** roles, accessible names and visible text a visitor relies on.
- **Data that must already exist:** rows the tests read but don't create, which go in `src/db/seed-data.ts`.
- **Test IDs:** only where no role, name or text can find something.

If the spec doesn't say something a test needs, don't invent it. Stop and list the gaps on the spec issue, because a guessed contract line becomes a wrong frozen test.

## 2. Write the tests

Put them in `frozen/acceptance/<feature>.spec.ts`.

- Import `test` and `expect` from `../helpers/fixtures.js`, which paces API calls under the per-IP limit.
- Start each test's title with the contract lines it checks, such as `C3, C4: a saved note shows in the list`. Every assertion must trace to one of them.
- Find things with `getByRole`, `getByLabel` and `getByText`. Use `getByTestId` only for a contract test ID.
- Create data through routes the contract names, with fresh IDs from `crypto.randomUUID()`, so tests don't depend on each other or on order.
- Keep each test one straight line of steps and assertions. `frozen/README.md` lists what the lint rejects. Logic that needs a branch goes in `frozen/helpers/`, with its own unit test.
- Never use Playwright's healer or generator agents on these files. They edit and skip failing tests.

**Evals:** if the spec has an AI feature with thresholds, stop and say so. The template has no eval harness yet, and the first episode with an AI feature builds it.

## 3. Check them

From `frozen/`:

```sh
npm ci
npm run lint
npm run typecheck
BASE_URL=<main's site> npx playwright test acceptance/
```

- Use the production URL of a portfolio episode, or the demo URL of a café episode. **Never café production**, whose data is real.
- **Every new test must fail on `main`,** because the feature doesn't exist yet. A test that passes proves nothing: fix the test, or tell the user the spec asks for something that's already there.
- Write down each test's failure reason for the PR.

## 4. Open the PR

Change only `frozen/`, so code owner review applies and the deploy is skipped (Q19). Use the `pr` skill for the body, and include:

- `Part of #$ARGUMENTS`, not `Closes`.
- A table of each test, its contract lines and why it fails on `main`.

Leave it as a normal PR, not draft, with no auto-merge. The user reviews the contract and the tests together, then merges.
