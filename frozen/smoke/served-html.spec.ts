import { expect, test } from "../helpers/fixtures.js";
import { foreignUrls, scriptSources } from "../helpers/served-html.js";

// Cloudflare's dashboard defaults can rewrite production's HTML outside
// Terraform: Web Analytics' RUM beacon broke the CSP and failed C51 (run
// 44250758105). So the served page must hold only the app's own scripts.
test("the served page has no /cdn-cgi/ or third-party script", async ({ request, page }) => {
  const response = await request.get("/");
  const html = await response.text();

  expect(response.status()).toBe(200);
  expect(html, "Cloudflare-injected markup in the served HTML").not.toContain("/cdn-cgi/");
  expect(foreignUrls(scriptSources(html), response.url()), "scripts in the served HTML from another origin").toEqual([]);

  // Scripts added after load, as Rocket Loader does, show up only in the page.
  await page.goto("/");
  const loaded = await page.locator("script[src]").evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).src));

  expect(foreignUrls(loaded, page.url()), "scripts in the loaded page from another origin").toEqual([]);
});
