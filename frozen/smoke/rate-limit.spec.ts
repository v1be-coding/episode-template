import { expect, test } from "../helpers/fixtures.js";
import { goOverTheLimit } from "../helpers/rate-limit.js";

// Its own project, after every other test, because it uses up this IP's minute.
test.use({ allow429: true });

test("going over the per-IP limit gives a handled 429", async ({ unpacedRequest, page }) => {
  // Up to a minute of requests, the page check, then up to a minute's wait.
  test.setTimeout(180_000);

  const { response } = await goOverTheLimit(unpacedRequest);

  expect(response?.status()).toBe(429);
  expect(await response?.json()).toMatchObject({ error: "rate_limited" });
  const retryAfter = Number(response?.headers()["retry-after"]);
  expect(retryAfter).toBeGreaterThan(0);

  await page.goto("/");
  await expect(page.getByText(/Too many requests\. Try again in \d+ seconds\./)).toBeVisible();

  // Wait out the window, so whatever runs next from this IP starts clean.
  await page.waitForTimeout((retryAfter + 1) * 1000);
});
