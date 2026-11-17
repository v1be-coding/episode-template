# Calling Claude

There is no Anthropic API key. Use `claude()` from `src/ai/claude.ts`.

## How it works

1. The Lambda asks AWS STS for a token that only Anthropic accepts. `infra/main.tf` allows tokens of up to 5 minutes, and the episode's boundary allows them only for an episode set up with `anthropic = true`.
2. The SDK trades that token for a short-lived Claude token, and refreshes it before it expires. A client kept for the container's life exchanges one token every few minutes.
3. Anthropic accepts the trade because of a federation rule made in Setup. The rule trusts this episode's Lambda roles, `v1be-<episode>-api-*`, so production and branch environments both work.

The four IDs the trade needs are in SSM at `/<episode>/third-party/anthropic-federation`. They aren't secrets, but don't copy them into the repo.

## Writing an AI route

```ts
import { claude, classifyClaudeError } from "../ai/claude.js";
import { costUsd, withSpendCap, worstCaseUsd } from "../limits/spend-cap.js";

const client = await claude();
const result = await withSpendCap(worstCaseUsd(inputTokens, MAX_TOKENS, PRICES), async () => {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
  });
  return { value: message, costUsd: costUsd(message.usage, PRICES) };
});
if (!result.ok) return spendCapResponse(result.retryAfterSeconds);
```

- **Never set `ANTHROPIC_API_KEY`.** The SDK prefers it over federation, so a leftover key would quietly replace the whole setup.
- **Fix the model, `max_tokens` and the system prompt on the server.** Never take them from the request.
- **Rebuild the conversation on the server** from validated `role` and `content` only. Never forward the client's history as it is. Forged history makes prompt injection several times more likely to succeed.
- **Every paid call goes through `withSpendCap`**, which is the daily dollar cap. Take prices from Anthropic's pricing page for the model you use.
- **Only the model Setup allowed can be called.** The workspace blocks every other model with a rate limit of 0. A spec that needs another model must ask Setup to raise its limit first, or every call gets a 429.

## When a call fails

Use `classifyClaudeError(error)`. It also catches errors that arrive mid-stream, which carry no HTTP status.

| Result        | Meaning                                         | Do                                                                        |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| `spend_limit` | The workspace's monthly limit or the tier's cap | Answer like the daily cap. Never retry                                    |
| `rate_limit`  | The workspace's requests per minute             | 503, try again shortly                                                    |
| `overloaded`  | Anthropic is busy for everyone                  | 503, try again shortly                                                    |
| `timeout`     | The 8-second request timeout                    | 503                                                                       |
| `auth`        | The federation rule or the Lambda's role        | 500, and log it. A person must check the Console's authentication history |
| `other`       | Anything else                                   | 500, and log it                                                           |

The client makes one attempt of at most 8 seconds, and the Lambda's timeout is 10, so the route always gets to answer. Raise both together if a route needs longer.

## Streaming

Avoid it unless the spec needs it. On Lambda:

- A streamed response keeps running, and costs money, after the visitor leaves.
- The SDK has no idle timeout.

If a spec needs streaming, pass an `AbortSignal` with a deadline under the Lambda's timeout, and stop when it fires.

## Tests

- **Unit tests never reach Anthropic, AWS or the network.** `createClaude` takes `ssm`, `sts` and `fetch`, so pass fakes. See `src/ai/claude.test.ts`.
- **A test against the real model** belongs in `frozen/`, on the branch environment only, and the spec decides whether there is one.

## Logging

Log metadata only: token counts, `stop_reason`, duration and outcome. Never log the visitor's text or the reply.
