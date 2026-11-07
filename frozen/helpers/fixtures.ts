import { test as base, expect, type APIRequestContext, type APIResponse, type TestInfo } from "@playwright/test";

// Q59: frozen tests face the same per-IP limit as visitors (120 a minute), so
// every API call they make is paced instead of the limit being raised or skipped.
// Tests import `test` and `expect` from here, and the pacing is automatic.
export const PACE = { calls: 100, windowMs: 60_000 };

// A test that makes more API calls than this is probably facing an app that
// floods its own API, which pacing alone would hide.
export const DEFAULT_API_BUDGET = 50;

// One list for the whole run, which works because the config sets workers: 1.
const sent: number[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until a call fits under PACE in the trailing window, and reports any wait.
async function waitForSlot(testInfo: TestInfo): Promise<void> {
  let waited = 0;
  for (;;) {
    const now = Date.now();
    while (sent.length > 0 && now - (sent[0] ?? now) >= PACE.windowMs) sent.shift();
    if (sent.length < PACE.calls) break;
    const wait = (sent[0] ?? now) + PACE.windowMs - now;
    waited += wait;
    await sleep(wait);
  }
  sent.push(Date.now());
  if (waited > 0) {
    testInfo.annotations.push({ type: "paced", description: `waited ${waited} ms for the rate limit` });
  }
}

type Tally = { calls: number; limited: string[] };

const PACED_METHODS = new Set(["delete", "fetch", "get", "head", "patch", "post", "put"]);

type Options = { allow429: boolean; apiBudget: number };

export const test = base.extend<
  Options & { tally: Tally; unpacedRequest: APIRequestContext; apiChecks: void }
>({
  // Only the test that trips the limit on purpose sets this.
  allow429: [false, { option: true }],
  apiBudget: [DEFAULT_API_BUDGET, { option: true }],

  tally: async ({}, use) => {
    await use({ calls: 0, limited: [] });
  },

  // A separate context, for the one test that must reach the limit. It can't
  // reuse `request`, because the override below replaces that for every fixture.
  unpacedRequest: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({ baseURL });
    await use(context);
    await context.dispose();
  },

  // Direct API calls from a test are paced and counted.
  request: async ({ request, tally }, use, testInfo) => {
    const paced = new Proxy(request, {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;
        if (!PACED_METHODS.has(String(property))) return value.bind(target);
        return async (...args: unknown[]) => {
          await waitForSlot(testInfo);
          tally.calls += 1;
          const response = (await value.apply(target, args)) as APIResponse;
          if (response.status() === 429) tally.limited.push(response.url());
          return response;
        };
      },
    });
    await use(paced);
  },

  // Calls the page makes to /api are paced and counted the same way.
  page: async ({ page, tally }, use, testInfo) => {
    await page.route("**/api/**", async (route) => {
      await waitForSlot(testInfo);
      tally.calls += 1;
      await route.continue();
    });
    page.on("response", (response) => {
      if (response.status() === 429 && new URL(response.url()).pathname.startsWith("/api/")) {
        tally.limited.push(response.url());
      }
    });
    await use(page);
  },

  // Runs after every test. Any 429 is a failure unless the test expects one, and
  // a test over its budget fails too.
  apiChecks: [
    async ({ tally, allow429, apiBudget }, use) => {
      await use();
      expect(tally.calls, "API calls this test made").toBeLessThanOrEqual(apiBudget);
      expect(allow429 ? [] : tally.limited, "API calls answered 429").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
