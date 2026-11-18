import { expect, test } from "../helpers/fixtures.js";
import { goOverTheLimit } from "../helpers/rate-limit.js";

// Its own project, after every other test, because it uses up this IP's minute.
test.use({ allow429: true });

test("going over the per-IP limit gives a handled 429", async ({ unpacedRequest, page }) => {
  // Up to a minute of requests, the page check, then up to a minute's wait.
  test.setTimeout(180_000);

  const { response } = await goOverTheLimit(unpacedRequest);

  expect(response?.status()).toBe(429);
  // Cloudflare's block (error 1015) is a 429 too, but not JSON.
  expect(response?.headers()["content-type"], "a 429 that isn't JSON is Cloudflare's block, not the app's").toContain("application/json");
  // retryAfterSeconds is server-made: proved by bounds (the time left in the
  // 60-second window) and by matching the header (docs/agents/spec.md).
  const retryAfter = Number(response?.headers()["retry-after"]);
  expect(retryAfter).toBeGreaterThanOrEqual(1);
  expect(retryAfter).toBeLessThanOrEqual(60);
  expect(await response?.json()).toEqual({
    error: "rate_limited",
    message: "Too many requests",
    retryAfterSeconds: retryAfter,
  });

  // Every line that calls the API shows the message under a flood, so a page
  // with more than one call shows it more than once (#42, attempt 1).
  await page.goto("/");
  await expect(page.getByText(/Too many requests\. Try again in \d+ seconds\./).first()).toBeVisible();

  // Wait out the window, so whatever runs next from this IP starts clean.
  await page.waitForTimeout((retryAfter + 1) * 1000);
});
