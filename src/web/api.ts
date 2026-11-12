// Every call to this app's API goes through here, so a limited visitor sees why
// instead of a page that looks broken (Q57).

// A 429 from the app, API Gateway's throttle or Cloudflare. Only the app's own
// carries a JSON body, so this relies on Retry-After alone.
export class RateLimitedError extends Error {
  constructor(
    readonly retryAfterSeconds: number,
    readonly reason: "rate_limited" | "daily_cap" | "unknown",
  ) {
    super("Too many requests");
  }
}

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API answered ${status}`);
  }
}

const DEFAULT_WAIT_SECONDS = 60;

// Retry-After is either seconds or an HTTP date.
export function parseRetryAfter(value: string | null, now: number = Date.now()): number {
  if (!value) return DEFAULT_WAIT_SECONDS;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isNaN(date) ? DEFAULT_WAIT_SECONDS : Math.max(1, Math.ceil((date - now) / 1000));
}

async function reasonOf(response: Response): Promise<RateLimitedError["reason"]> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return body.error === "rate_limited" || body.error === "daily_cap" ? body.error : "unknown";
  } catch {
    return "unknown";
  }
}

// Never retries by itself, so a waiting visitor doesn't add to the load.
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 429) {
    const wait = parseRetryAfter(response.headers.get("retry-after"));
    throw new RateLimitedError(wait, await reasonOf(response));
  }
  if (!response.ok) throw new ApiError(response.status);
  return (await response.json()) as T;
}

export function limitMessage(error: RateLimitedError): string {
  return error.reason === "daily_cap"
    ? "The AI feature is paused until tomorrow."
    : `Too many requests. Try again in ${error.retryAfterSeconds} seconds.`;
}

// What a line on the page shows in place of its value when a call fails: the
// limit message when rate-limited, otherwise "unavailable".
export function failureText(error: unknown): string {
  return error instanceof RateLimitedError ? limitMessage(error) : "unavailable";
}
