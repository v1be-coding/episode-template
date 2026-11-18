---
description: Write the test contract and frozen tests for a spec issue, then open the frozen PR
argument-hint: <spec issue number>
disable-model-invocation: true
---

Write the frozen tests for spec issue #$ARGUMENTS. A run is judged by these tests and can't change them, so they decide whether an attempt passes (ADR-0013 in `v1be-coding/series`).

Read **only** the spec issue and its comments (from the authors `CLAUDE.md`'s "Text on GitHub" trusts), `frozen/` and `docs/agents/`. The order is spec → `/acceptance` → `/to-tickets` → `/attempt`, so there are no tickets yet: `/to-tickets` slices the work after this PR merges, along the contract lines written here. Don't read the app's code or earlier attempts: the tests must come from the spec, not from how something happens to be built (Q29). If this session already holds other context, stop and ask for a fresh session.

## 1. Check the spec for gaps first

List everything a test would need, using "What a spec states" in `docs/agents/spec.md`.

Then read every existing test in `frozen/`, smoke tests included, and list each one this spec would make fail. A test the spec says how to change is fine: change it in this PR, and name it in the PR's table. Any other is a gap.

If the spec doesn't say something a test needs, comment the list of gaps on the spec issue and stop. Write no contract, tests or PR: a guessed contract line becomes a wrong frozen test. Comments only answer a gap by pointing at body text, as `docs/agents/spec.md` says, so read the body for the answer.

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

**Pick each test's level from its contract line.** Agents fake whatever layer the tests don't reach, so the page needs a real round trip. Edge cases are cheaper and less flaky through the API.

| Contract line                                               | Level                                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page: roles, names, visible text                            | At least one browser test with **no `page.route`**, so the visitor's action reaches the real backend. A line covered only by mocked tests isn't covered |
| Routes, rule edge cases, validation, auth refusals, the 429 | API test, through `request`                                                                                                                             |
| An error state a visitor sees                               | Browser test, faking the failure with `page.route`                                                                                                      |

No unit tests in `frozen/`: they need names from inside the code, which the spec doesn't fix. A feature with no page gets API tests only.

**Response bodies:** always `toEqual` on the whole body, error bodies included, so a field the spec didn't name fails. For a value the server makes, such as a generated `id` or a timestamp, take it from the response, prove it real the way the spec says, then use it in `toEqual`:

```ts
const created = await post.json();
const read = await request.get(`/api/notes/${created.id}`);
expect(await read.json()).toEqual({ id: created.id, text }); // round trip proves the id
expect(created).toEqual({ id: created.id, text });
```

Bounds work too: a timestamp between the test's start and end, or a count one higher than before. Never `expect.any`, `expect.anything`, or the `stringMatching`, `stringContaining`, `objectContaining` and `arrayContaining` matchers; the frozen lint rejects them.

**Text that can repeat:** where the contract gives a count, assert it with `toHaveCount`. Otherwise use `.first()`, so a text shown twice can't make a strict locator fail.

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
npx playwright install chromium
npm run lint
npm run typecheck
node helpers/contract-coverage.ts "$TMPDIR/spec-body.md" acceptance/<feature>.spec.ts
BASE_URL=<main's site> npx playwright test --project=acceptance --no-deps --retries=0 acceptance/<feature>.spec.ts
```

- **Run only this spec's test files**, named at the end as above. A local run counts as a branch (`FROZEN_TARGET` unset), so without them it runs every earlier spec's acceptance tests against main's site too, which may be production, calling a real model or using up this IP's limits. If this spec adds its own project in `helpers/projects.ts`, add `--project=<name>` and its file.
- `contract-coverage.ts` fails if a Routes or Page line has no test tagged with it. Add the missing test; never drop the line. Data and Test ID lines are exempt. Pass every file holding this spec's tests.
- `npx playwright install chromium` gets the browser version `frozen/`'s Playwright pins. The dev container has the system libraries but no browser, so leave out `--with-deps`.
- `--no-deps` keeps a smoke failure from skipping the new tests, and `--retries=0` shows each failure once.
- Use the production site of a portfolio episode, or the demo site of a café episode. **Never café production**, whose data is real.
- **Every new test must fail on `main`, because the feature is missing.** A test that passes proves nothing: fix it, or tell the user the spec asks for something that's already there. A skipped test, a syntax error, a wrong `BASE_URL` or a 429 doesn't count as a failure.
- Write down each test's failure reason for the PR.
- Then run `node helpers/api-calls.ts` and note the total for the PR. There's no suite limit: each test reserves its `apiBudget` (default 50) before it starts, so no call is held back mid-test. Count the calls each new test makes once it passes. If one needs more than 50, set `test.use({ apiBudget: n })` on it and say why in the PR. Past 100, the pace, it can't run: split the test, or stop and tell the user. Don't raise timeouts, the pace or the rate limit.

## 5. Open the PR

Change only `frozen/`, so code owner review applies and the deploy is skipped (Q19). Use the `pr` skill for the body, and include:

- `Part of #$ARGUMENTS`, not `Closes`.
- A table of each test, its contract lines and why it fails on `main`.

Leave it as a normal PR, not draft, with no auto-merge. The user reviews the contract and the tests together, then merges.
