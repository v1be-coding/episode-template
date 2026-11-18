import { test as base, expect, type APIRequestContext, type APIResponse, type TestInfo } from "@playwright/test";
import { API_BUDGET_ANNOTATION, API_CALLS_ANNOTATION } from "./api-calls.js";
import { limitedEntry } from "./cloudflare.js";
import { EVIDENCE_ATTACHMENT, EvidenceLog } from "./evidence.js";
import { PACE, callWait, reservationWait } from "./pace.js";

// Tests import `test` and `expect` from here, and the pacing is automatic: each
// test reserves its API budget before it starts, and every call is paced (Q59).
export { PACE };

// A test that makes more API calls than this is probably facing an app that
// floods its own API, which pacing alone would hide.
export const DEFAULT_API_BUDGET = 50;
// One list for the whole run, which works because the config sets workers: 1.
const sent: number[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


// Waits until a call fits under PACE in the trailing window, and reports any wait.
// After a test's reservation, only a test over its own budget ever waits here.
async function waitForSlot(testInfo: TestInfo): Promise<void> {
  let waited = 0;
  for (let wait = callWait(sent, Date.now()); wait > 0; wait = callWait(sent, Date.now())) {
    waited += wait;
    await sleep(wait);
  }
  sent.push(Date.now());
  while (sent.length > 0 && Date.now() - (sent[0] ?? 0) >= PACE.windowMs) sent.shift();
  if (waited > 0) {
    testInfo.annotations.push({ type: "paced", description: `waited ${waited} ms for the rate limit` });
  }
}

type Tally = { calls: number; limited: string[] };

// `fetch` takes its method from the options, and the others are named for theirs.
function methodOf(property: string, options: unknown): string {
  if (property !== "fetch") return property.toUpperCase();
  const method = (options as { method?: unknown } | undefined)?.method;
  return typeof method === "string" ? method.toUpperCase() : "GET";
}

const PACED_METHODS = new Set(["delete", "fetch", "get", "head", "patch", "post", "put"]);

type Options = { allow429: boolean; apiBudget: number };

export const test = base.extend<
  Options & { reserve: void; tally: Tally; unpacedRequest: APIRequestContext; apiChecks: void; evidence: EvidenceLog }
>({
  // Only the test that trips the limit on purpose sets this.
  allow429: [false, { option: true }],
  apiBudget: [DEFAULT_API_BUDGET, { option: true }],

  // Before the test starts, waits until its whole budget fits under PACE, so no
  // call is held back mid-test. The wait has its own timeout, apart from the test's.
  reserve: [
    async ({ apiBudget }, use, testInfo) => {
      if (apiBudget > PACE.calls) {
        throw new Error(`apiBudget ${apiBudget} is over PACE (${PACE.calls} a minute), so this test's calls can't all fit.`);
      }
      let waited = 0;
      for (let wait = reservationWait(sent, Date.now(), apiBudget); wait > 0; wait = reservationWait(sent, Date.now(), apiBudget)) {
        waited += wait;
        await sleep(wait);
      }
      if (waited > 0) {
        testInfo.annotations.push({ type: "reserved", description: `waited ${waited} ms before starting, so its API budget fit under the pace` });
      }
      await use();
    },
    { auto: true, timeout: PACE.windowMs + 10_000 },
  ],

  // Depends on reserve, so the reservation comes before any fixture that calls the API.
  tally: async ({ reserve }, use) => {
    void reserve;
    await use({ calls: 0, limited: [] });
  },

  // Every attempt attaches what the network and page did, for the retry reporter.
  evidence: [
    async ({ baseURL, allow429 }, use, testInfo) => {
      const log = new EvidenceLog(baseURL, testInfo.retry, allow429);
      await use(log);
      await testInfo.attach(EVIDENCE_ATTACHMENT, {
        body: JSON.stringify(log.data),
        contentType: "application/json",
      });
    },
    { auto: true, box: true },
  ],

  // A separate context, for the one test that must reach the limit. It can't
  // reuse `request`, because the override below replaces that for every fixture.
  unpacedRequest: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({ baseURL });
    await use(context);
    await context.dispose();
  },

  // Direct API calls from a test are paced and counted.
  request: async ({ request, tally, evidence, baseURL }, use, testInfo) => {
    const paced = new Proxy(request, {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver);
        if (typeof value !== "function") return value;
        if (!PACED_METHODS.has(String(property))) return value.bind(target);
        return async (...args: unknown[]) => {
          await waitForSlot(testInfo);
          tally.calls += 1;
          const method = methodOf(String(property), args[1]);
          const started = Date.now();
          let response: APIResponse;
          try {
            response = (await value.apply(target, args)) as APIResponse;
          } catch (error) {
            evidence.failed(new URL(String(args[0]), baseURL).href, method, String(error));
            throw error;
          }
          evidence.finished(response.url(), method, response.status(), Date.now() - started, response.headers());
          if (response.status() === 429) tally.limited.push(limitedEntry(response.url(), response.headers()["content-type"]));
          return response;
        };
      },
    });
    await use(paced);
  },

  // Calls the page makes to /api are paced and counted the same way.
  page: async ({ page, tally, evidence }, use, testInfo) => {
    await page.route("**/api/**", async (route) => {
      await waitForSlot(testInfo);
      tally.calls += 1;
      await route.continue();
    });
    page.on("requestfailed", (request) => {
      evidence.failed(request.url(), request.method(), request.failure()?.errorText ?? "no response");
    });
    page.on("requestfinished", async (request) => {
      const response = await request.response();
      if (!response) return;
      const { responseEnd } = request.timing();
      evidence.finished(request.url(), request.method(), response.status(), responseEnd >= 0 ? responseEnd : null, response.headers());
    });
    page.on("pageerror", (error) => evidence.pageError(error.message));
    page.on("response", (response) => {
      if (response.status() === 429 && new URL(response.url()).pathname.startsWith("/api/")) {
        tally.limited.push(limitedEntry(response.url(), response.headers()["content-type"]));
      }
    });
    await use(page);
  },

  // Runs after every test. Any 429 is a failure unless the test expects one, and
  // a test over its budget fails too.
  apiChecks: [
    async ({ tally, allow429, apiBudget }, use, testInfo) => {
      await use();
      // Read by helpers/api-calls.ts, which totals the suite's calls.
      testInfo.annotations.push({ type: API_CALLS_ANNOTATION, description: String(tally.calls) });
      testInfo.annotations.push({ type: API_BUDGET_ANNOTATION, description: String(apiBudget) });
      expect(tally.calls, "API calls this test made").toBeLessThanOrEqual(apiBudget);
      expect(allow429 ? [] : tally.limited, "API calls answered 429").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
