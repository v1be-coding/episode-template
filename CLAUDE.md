# CLAUDE.md

A V1be Coding episode: one app, built from a spec in one run. The series' rules are in [`v1be-coding/series`](https://github.com/v1be-coding/series) (`V1BE_CODING.md`).

## Where things are

- **Other repos:** work only inside this repo. Never read a parent or sibling folder: the session's settings refuse it, and other repos' local copies aren't meant for you. To read another `v1be-coding` repo, such as `series` or `v1be-infra`, clone it once into your scratchpad with `git clone --depth 1 https://github.com/v1be-coding/<repo>`, read that copy from then on, and `git pull` it if you need newer files. Don't fetch files one at a time from GitHub.
- **Commands:** `/acceptance` writes the frozen tests from a spec, and `/attempt` builds and lands one. Both are in `.claude/commands/`. Setup isn't a command here: it runs in a workspace session from [`adding-an-episode.md`](https://github.com/v1be-coding/v1be-infra/blob/main/docs/adding-an-episode.md) in `v1be-infra`, and it's done before an episode session starts. After an episode, `/scorecard` reads its results from GitHub, then `/retro`.
- **`frozen/`:** the tests a run is judged by. A run never edits them. See `frozen/README.md`.
- **Spec phase:** what a spec must pin down for the frozen tests, and the rule for comments on a spec issue, are in `docs/agents/spec.md`. Read it before grilling or writing a spec.
- **`.github/workflows/`:** the required chain is in `deploy.yml`. Only the user commits workflows.
- **Database rules:** `README.md`.
- **Calling Claude:** `src/ai/claude.ts`, with no API key. Read `docs/calling-claude.md` before writing an AI route.

## Checks

`npm run lint`, `npm run typecheck`, `npm test` and a secret scan (`npm run secrets`) run in the pre-commit hook and in CI. In `frozen/`, `npm run lint` checks the frozen test rules.

## Agent skills

### Issue tracker

GitHub Issues in `v1be-coding/<this repo>`, through `gh`, with no triage labels. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context. `GLOSSARY.md` and `docs/adr/` at the repo root hold this episode's terms and decisions. They don't exist until `/grill-with-docs` creates them in the spec phase, so a missing file is normal. Shared terms and decisions are in the series repo. See `docs/agents/domain.md`.
