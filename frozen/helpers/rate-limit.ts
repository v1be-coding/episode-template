import type { APIRequestContext, APIResponse } from "@playwright/test";

// The frozen smoke test's 4th check (Q21, Q59). It sends at a steady 3 a second
// on a fixed schedule, so the app's fixed 60-second window passes 120 within
// about 81 s wherever the probe starts (at most 242 requests). That keeps well
// under Cloudflare's 50 in 10 seconds, whose counts aren't exact, and API
// Gateway's 10 a second, so the 429 that comes back is the app's own.
export const LIMIT_PROBE = { perSecond: 3, maxRequests: 245 };

export async function goOverTheLimit(
  request: APIRequestContext,
  path = "/api/health",
): Promise<{ response: APIResponse | undefined; sent: number }> {
  const start = Date.now();
  const gap = 1000 / LIMIT_PROBE.perSecond;
  const pending: Promise<unknown>[] = [];
  let limited: APIResponse | undefined;
  let sent = 0;

  for (let i = 0; i < LIMIT_PROBE.maxRequests && !limited; i++) {
    const due = start + i * gap;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, due - Date.now())));
    sent += 1;
    pending.push(
      request.get(path).then((response) => {
        if (response.status() === 429 && !limited) limited = response;
      }),
    );
  }
  await Promise.allSettled(pending);
  return { response: limited, sent };
}
