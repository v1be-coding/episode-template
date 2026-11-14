# Specs: what the frozen tests need

`/acceptance` writes the frozen tests from the spec issue alone, and a run is judged by them. Anything the spec leaves open, `/acceptance` must stop and ask about, or worse, decide. So while grilling and writing a spec, pin each item below down in the spec issue's body.

## What a spec states

- **Every route:** method, path, request shape, and the exact response for each case: success, each error, and each status code. List every field a response holds, error bodies included. The tests compare whole bodies, so any other field fails them.
- **Values the server makes,** such as a generated ID or a timestamp: let the client choose the value where the API allows, and the test checks the exact value it sent. Otherwise say how a test proves the value is real: a round trip (the ID from the POST reads back the same record) or bounds (a time within the request, a count one higher).
- **Every error state a visitor can see:** what triggers it, and the exact text or role that shows it.
- **The page:** the roles, accessible names and visible text a visitor relies on. Where it matters how many times a text appears, say how many.
- **Data that must already exist:** rows the feature reads but doesn't create.
- **Terms with more than one meaning:** define them where the spec first uses them. For #42, "the origin check" and "a failed request" each cost `/acceptance` a stop.
- **What the acceptance tests leave out:** behaviour the spec wants but no frozen test should check, such as a timing or a look, so `/acceptance` doesn't guess at it.

## Responses the template already makes

A spec doesn't restate these, and a feature mustn't change them without saying so, as the next section describes. Both come with `content-type: application/json` and a `retry-after` header.

- **Over the per-IP limit** (120 requests per IP per fixed 60-second window), any route: `429` with exactly `{ "error": "rate_limited", "message": "Too many requests", "retryAfterSeconds": <n> }`.
- **AI spend cap reached,** on a route wrapped in `withSpendCap`: `429` with exactly `{ "error": "daily_cap", "message": "The AI feature is paused until tomorrow", "retryAfterSeconds": <n> }`.

`retryAfterSeconds` is server-made. A test proves it by bounds: it equals the `retry-after` header, and for `rate_limited` it is between 1 and 60, the time left in the window.

## Changes to frozen tests that already exist

If the feature changes behaviour that an existing frozen test checks, such as the smoke tests, say so in the spec, and say what the test should check instead. `/acceptance` fixes it in the same frozen PR.

## Comments on a spec issue

`/acceptance` reads the spec issue's comments, so a comment reaches the test writer as surely as the body does.

- Answer a gap by editing the body, with the user's approval. Then comment only to point at the edited text.
- Anything new, such as a decision, an example or a rule, goes in the body, never only in a comment.
