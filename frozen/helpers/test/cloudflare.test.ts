// Run with: npm run test:helpers
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { limitedEntry } from "../cloudflare.ts";

describe("429 labels", () => {
  it("keeps the app's JSON 429 as the bare URL", () => {
    assert.equal(limitedEntry("https://x/api/a", "application/json; charset=utf-8"), "https://x/api/a");
  });

  it("names a non-JSON 429 as Cloudflare's block", () => {
    assert.equal(limitedEntry("https://x/api/a", "text/html"), "https://x/api/a (Cloudflare's block, error 1015, not the app's 429)");
    assert.match(limitedEntry("https://x/api/a", undefined), /Cloudflare's block/);
  });
});
