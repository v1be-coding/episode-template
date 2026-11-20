# Specs: what the frozen tests need

`/acceptance` writes the frozen tests from the spec issue alone, and a run is judged by them. Anything the spec leaves open, `/acceptance` must stop and ask about, or worse, decide. So while grilling and writing a spec, pin each item below down in the spec issue's body.

**Read `docs/agents/setup-notes.md` first, if it exists.** Setup writes it with what this episode's infra can and can't do, and anything else the spec must honour. Each note is a constraint on the spec, unless the user says otherwise. No file means Setup had nothing to add.

## What a spec states

- **Every route:** method, path, request shape, and the exact response for each case: success, each error, and each status code. List every field a response holds, error bodies included. The tests compare whole bodies, so any other field fails them.
- **Values the server makes,** such as a generated ID or a timestamp: let the client choose the value where the API allows, and the test checks the exact value it sent. Otherwise say how a test proves the value is real: a round trip (the ID from the POST reads back the same record) or bounds (a time within the request, a count one higher).
- **Every error state a visitor can see:** what triggers it, and the exact text or role that shows it. If it shows inside a labelled line, say whether the label stays, such as `Note: ` before the limit message.
- **The page:** the roles, accessible names and visible text a visitor relies on. Where it matters how many times a text appears, say how many.
- **Data that must already exist:** rows the feature reads but doesn't create.
- **Terms with more than one meaning:** define them where the spec first uses them. For #42, "the origin check" and "a failed request" each cost `/acceptance` a stop.
- **Constraints every ticket needs:** one section with that exact heading, `## Constraints every ticket needs`, of at most 3 KB. It holds every rule more than one ticket must honour, such as security headers and the CSP, shared API headers, React or style rules, data that must never appear, logging limits, and terms. State each rule once, there, and have feature sections point to it. Implementers read this section and their ticket's sections, not the whole spec.
- **A 404 page and a favicon, when the episode has `pages = true`.** Production's CloudFront serves `/404.html` for any unknown path, so the build must have one, or visitors see S3's XML error. Browsers ask for `/favicon.ico` when a page links no icon, and get that error too. State the 404 page's text and the icon files, and give each a C-line: `/404.html` is served as `text/html` with that text, and the page links an icon that's served. Branch environments map the 403 the same way, so the test runs on both. Add a smoke test that an unknown page returns `404` as `text/html`, next to the template's unknown API path test in `frozen/smoke/smoke.spec.ts`. AInakupo's spec asked for neither, and both were fixed after the episode.
- **Product checklist:** one section with that exact heading, `## Product checklist`: the things the user checks by hand on the branch environment before approving, written as short lines they can tick. `/attempt` copies it into the PR, and the user approves `checklist` against it.
- **What the acceptance tests leave out:** behaviour the spec wants but no frozen test should check, such as a timing or a look, so `/acceptance` doesn't guess at it.

## Responses the template already makes

A spec doesn't restate these, and a feature mustn't change them without saying so, as the next section describes. Both come with `content-type: application/json` and a `retry-after` header.

- **Over the per-IP limit** (120 requests per IP per fixed 60-second window), any route: `429` with exactly `{ "error": "rate_limited", "message": "Too many requests", "retryAfterSeconds": <n> }`.
- **AI spend cap reached,** on a route wrapped in `withSpendCap`: `429` with exactly `{ "error": "daily_cap", "message": "The AI feature is paused until tomorrow", "retryAfterSeconds": <n> }`.

`retryAfterSeconds` is server-made. A test proves it by bounds: it equals the `retry-after` header, and for `rate_limited` it is between 1 and 60, the time left in the window.

## What CI can build

A spec can only ask for infrastructure the episode's CI role can create, or read and reuse. Episode 0's spec asked for a branch response headers policy and a branch CloudFront function, which CI can't create, and only the attempt found out. Check every resource the spec adds against the role in `v1be-infra` (`modules/episode/main.tf`, and `modules/episode/branch.tf` for branch environments), from a clone in your scratchpad.

- **CI creates and changes:** the episode's Lambda, its logs, DynamoDB tables, its own DSQL cluster, API Gateway, alarms, and a branch environment's bucket and distribution.
- **CI only reads:** CloudFront cache policies, response headers policies, the origin access control, and the shared `v1be-pages` function. A branch environment attaches production's policies, or the shared function, through a data source. It never creates its own.
- **Only Setup changes:** production's distribution, routing (`/` and `/api/*`), headers, CloudFront functions, DNS and every Cloudflare setting, all in `v1be-infra`. If the spec needs one of these, say so in the spec as a Setup change, and say whether branch environments need the same.
- **Cloudflare sits in front of production only.** Branch environments are served straight from CloudFront, so a Cloudflare feature that rewrites HTML or injects a script shows up first in production's smoke run. A spec that pins exact text or a strict CSP relies on `v1be-infra` keeping those features off.

## How the frozen tests run

A rule the suite can't test is a gap, even if the app could meet it. Choose limits, timings and checks with these in mind:

- **One runner, one IP, one test at a time.** Every test shares the per-IP limit. Each test reserves an `apiBudget` of calls (default 50) before it starts, and no test can need more than 100, the pace.
- **Retries run at the end,** isolated, and a fix round reruns the whole suite. A limit with a long window, such as 20 an hour, can be used up by an earlier round and isn't reset by the next. Give branch environments a window the suite can test, such as 60 seconds, and say so if production differs. That is a deliberate exception to Q52, which otherwise keeps branch infrastructure the same as production.
- **A Page line needs a real round trip.** `/acceptance` doesn't count a line that only mocked browser tests cover, so a visitor's action that reaches a real model makes a real call.
- **No raised timeouts,** in tests or in the pace.
- **Browser facts:** Chromium logs a console error, `Failed to load resource: … 404`, for any document or file that returns 404, the site's own 404 page included. So a "clean console" check can't cover a 404 page. Event Timing only reports events of 16 ms or more (104 ms by default), apart from the first input, so a responsiveness check can't measure below that.
- **Limits must agree with each other,** such as a stored field's cap and the longest reply that fills it.

## Changes to frozen tests that already exist

If the feature changes behaviour that an existing frozen test checks, such as the smoke tests, say so in the spec, and say what the test should check instead. `/acceptance` fixes it in the same frozen PR.

## Comments on a spec issue

`/acceptance` reads the spec issue's comments, so a comment reaches the test writer as surely as the body does.

- Answer a gap by editing the body, with the user's approval. Then comment only to point at the edited text.
- Anything new, such as a decision, an example or a rule, goes in the body, never only in a comment.
- After the frozen PR merges, a spec section that a C-line points to changes only through `/acceptance`, which adds a new C-number. The C-lines hold no values of their own, so an edit there changes what the frozen tests mean.
