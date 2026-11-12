# CLAUDE.md

A V1be Coding episode: one app, built from a spec in one run. The series' rules are in [`v1be-coding/series`](https://github.com/v1be-coding/series) (`V1BE_CODING.md`).

## Where things are

- **Commands:** `/acceptance` writes the frozen tests from a spec, and `/attempt` builds and lands one. Both are in `.claude/commands/`. After an episode, `/scorecard` reads its results from GitHub, then `/retro`.
- **`frozen/`:** the tests a run is judged by. A run never edits them. See `frozen/README.md`.
- **Spec phase:** what a spec must pin down for the frozen tests, and the rule for comments on a spec issue, are in `docs/agents/spec.md`. Read it before grilling or writing a spec.
- **`.github/workflows/`:** the required chain is in `deploy.yml`. Only the user commits workflows.
- **Database rules:** `README.md`.

## Checks

`npm run lint`, `npm run typecheck`, `npm test` and a secret scan (`npm run secrets`) run in the pre-commit hook and in CI. In `frozen/`, `npm run lint` checks the frozen test rules.

## Agent skills

### Issue tracker

GitHub Issues in `v1be-coding/<this repo>`, through `gh`, with no triage labels. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root, plus the series' shared ones. See `docs/agents/domain.md`.
