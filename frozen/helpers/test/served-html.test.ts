// Run with: npm run test:helpers
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { foreignUrls, scriptSources } from "../served-html.ts";

describe("served HTML", () => {
  it("finds every script src, in any quoting, and skips inline scripts", () => {
    const html = `<script type="module" src="/assets/a.js"></script><SCRIPT src='b.js'></SCRIPT>
      <script defer src=https://static.cloudflareinsights.com/beacon.min.js data-cf-beacon="{}"></script><script>inline()</script>`;
    assert.deepEqual(scriptSources(html), ["/assets/a.js", "b.js", "https://static.cloudflareinsights.com/beacon.min.js"]);
  });

  it("keeps only URLs from another origin", () => {
    assert.deepEqual(
      foreignUrls(["/assets/a.js", "https://site.example/b.js", "//cdn.example/c.js", "http://site.example/d.js"], "https://site.example/"),
      ["https://cdn.example/c.js", "http://site.example/d.js"],
    );
  });

  it("is empty for no scripts", () => {
    assert.deepEqual(scriptSources("<p>hi</p>"), []);
    assert.deepEqual(foreignUrls([], "https://site.example/"), []);
  });
});
