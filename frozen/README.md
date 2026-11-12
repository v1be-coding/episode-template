# Frozen tests

Tests written during the Spec phase, before a run starts. CI takes this folder from `main`'s commit in the PR's merge commit, not from the PR, so a run's edits here have no effect, and changing it needs code owner review. See [ADR-0013](https://github.com/v1be-coding/series/blob/main/docs/adr/0013-runs-land-through-auto-merge-and-frozen-tests.md).

## Where each test runs

| Folder | Branch environment | Production |
| --- | --- | --- |
| `smoke/` | Yes | Yes |
| `acceptance/` | Yes | No (Q29) |

`verify.yml` sets `FROZEN_TARGET`, and `helpers/projects.ts` picks the projects. A local run counts as a branch.

## The frozen lint

CI rejects any test file here that uses one of these. A test must be one straight line of steps and assertions, because agent-written tests have been seen returning early or skipping and still passing.

| Not allowed | Why |
| --- | --- |
| `if`, `?:`, `switch` | A test could take a path that asserts nothing |
| `try`, `.catch()` | Could swallow a failed assertion |
| `return` | Could end a test before its assertions |
| `.skip`, `.only`, `.fixme`, `.fail` | Turn tests off, or make a failing test pass |
| A `test(...)` with no `expect(...).matcher()` | Asserts nothing |

`helpers/` is exempt. Shared logic that needs branches goes there, and code owner review covers it like the rest of this folder.

```sh
npm run lint            # the frozen lint
npm run typecheck       # TypeScript, for tests and helpers
npm run test:helpers    # the helpers' own unit tests
```

## Retries and the retry report

Each test gets one retry (Q40). A test that needed it counts as a pass, and the PR comment lists it.

- `helpers/evidence.ts` records what the network and page did during each attempt: requests with no response, 4xx and 5xx responses with a few allowlisted headers, the slowest request, and page errors. It keeps the app's own origin only, paths without query strings, and never bodies or cookies.
- `helpers/retry-reporter.ts` writes `reports/retry-report.md` and `reports/retry-report.json`. Each retried or failed test gets a hint: `infra-looking`, `app-looking` or `unclear`. The hints are unvalidated and never block anything, so the report always shows the evidence behind them.
- Traces are uploaded only from branch environments, because Playwright can't redact them.
