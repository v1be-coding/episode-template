---
description: Write the test contract and frozen tests for a spec issue, then open the frozen PR
argument-hint: <spec issue number>
disable-model-invocation: true
---

Write the frozen tests for spec issue #$ARGUMENTS. A run is judged by these tests and can't change them, so they decide whether an attempt passes (ADR-0013 in `v1be-coding/series`).

Read **only** the spec issue and its comments, the tickets it links, `frozen/` and `docs/agents/`. Don't read the app's code or earlier attempts: the tests must come from the spec, not from how something happens to be built (Q29). If this session already holds other context, stop and ask for a fresh session.

## 1. Check the spec for gaps first

List everything a test would need: each route's method, path, request and response shapes and status codes; the roles, accessible names and visible text a visitor relies on; and any data that must already exist.

If the spec doesn't say something a test needs, comment the list of gaps on the spec issue and stop. Write no contract, tests or PR: a guessed contract line becomes a wrong frozen test.

## 2. Write the test contract

Add a `## Test contract` section to the end of the spec issue's body. `gh issue edit --body` replaces the whole body, so edit a copy:

```sh
gh issue view $ARGUMENTS --json body --jq .body > "$TMPDIR/spec-body.md"
# append the section to that file, or replace an existing "## Test contract" section
gh issue edit $ARGUMENTS --body-file "$TMPDIR/spec-body.md"
```

Number each line `C1`, `C2` and so on, and cover only what the spec states:

- **Routes:** method, path, and request and response shapes, with status codes.
- **Page:** roles, accessible names and visible text a visitor relies on.
- **Data that must already exist:** rows the tests read but don't create. List them here, and the attempt adds them to the seed data.
- **Test IDs:** only where no role, name or text can find something.

Never renumber a line once its tests have merged. A later spec fix adds new numbers.

## 3. Write the tests

Put them in `frozen/acceptance/<feature>.spec.ts`.

- Import `test` and `expect` from `../helpers/fixtures.js`, which paces API calls under the per-IP limit.
- Start each test's title with the contract lines it checks, such as `C3, C4: a saved note shows in the list`, and tag it with them too: `test("C3, C4: …", { tag: ["@C3", "@C4"] }, async …)`. Every assertion must trace to one of them.
- Find things with `getByRole`, `getByLabel` and `getByText`. Use `getByTestId` only for a contract test ID.
- Use web-first assertions, such as `await expect(locator).toBeVisible()`, never `expect(await locator.isVisible())`. They wait for the page.
- **Make each test's data unique** with `crypto.randomUUID()`, in IDs when the contract lets the caller choose them, or else inside names or text. Tests mustn't depend on each other or on order.
- **Assert on what the test created.** Data builds up on every target, so never assume an empty list or an exact total. Compare a value before and after an action, or find the unique value the test made. Locators are strict, and fail if more than one element matches.
- Keep each test one straight line of steps and assertions. `frozen/README.md` lists what the lint rejects. Logic that needs a branch goes in `frozen/helpers/`, with its own unit test.
- Never use Playwright's healer or generator agents on these files. The healer edits or skips failing tests, and the generator builds tests from the running app, not the spec.

**Evals:** if the spec has an AI feature with thresholds, stop and say so. The template has no eval harness yet, and the first episode with an AI feature builds it.

## 4. Check them

From `frozen/`, with `<main's site>` from the README's "Sites" section:

```sh
npm ci
npm run lint
npm run typecheck
BASE_URL=<main's site> npx playwright test --project=acceptance --no-deps --retries=0
```

- `--no-deps` keeps a smoke failure from skipping the new tests, and `--retries=0` shows each failure once.
- Use the production site of a portfolio episode, or the demo site of a café episode. **Never café production**, whose data is real.
- **Every new test must fail on `main`, because the feature is missing.** A test that passes proves nothing: fix it, or tell the user the spec asks for something that's already there. A skipped test, a syntax error, a wrong `BASE_URL` or a 429 doesn't count as a failure.
- Write down each test's failure reason for the PR.

## 5. Open the PR

Change only `frozen/`, so code owner review applies and the deploy is skipped (Q19). Use the `pr` skill for the body, and include:

- `Part of #$ARGUMENTS`, not `Closes`.
- A table of each test, its contract lines and why it fails on `main`.

Leave it as a normal PR, not draft, with no auto-merge. The user reviews the contract and the tests together, then merges.
