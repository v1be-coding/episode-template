// Run with: npm run test:helpers
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Evidence } from "../evidence.ts";
import { buildReport, hintFor, type Entry } from "../retry-hints.ts";

const quiet = (changes: Partial<Evidence> = {}): Evidence => ({
  retry: 0,
  failedRequests: [],
  errorResponses: [],
  slowest: { method: "GET", path: "/api/health", elapsedMs: 120 },
  pageErrors: [],
  dropped: 0,
  ...changes,
});

const response = (status: number, headers: Record<string, string> = {}) => ({
  status,
  method: "GET",
  path: "/api/notes/1",
  elapsedMs: 300,
  atMs: 1000,
  headers,
});

const hint = (evidence: Evidence | null, error = "Error: boom", status = "failed") =>
  hintFor({ status, error, evidence }).hint;

describe("retry hints", () => {
  it("defaults to unclear when nothing points either way", () => {
    assert.equal(hint(quiet()), "unclear");
  });

  it("is unclear with no evidence", () => {
    assert.equal(hint(null), "unclear");
  });

  it("calls a bare timeout unclear", () => {
    const result = hintFor({ status: "timedOut", error: "Test timeout of 30000ms exceeded.", evidence: quiet() });
    assert.equal(result.hint, "unclear");
    assert.match(result.reason, /timed out/);
  });

  for (const [name, evidence] of [
    ["a request with no response", quiet({ failedRequests: [{ method: "GET", path: "/", error: "net::ERR_RESET", atMs: 1 }] })],
    ["a 429", quiet({ errorResponses: [response(429)] })],
    ["a 503", quiet({ errorResponses: [response(503)] })],
    ["a Cloudflare challenge", quiet({ errorResponses: [response(403, { "cf-mitigated": "challenge" })] })],
    ["a slow request", quiet({ slowest: { method: "GET", path: "/api/x", elapsedMs: 12_000 } })],
  ] as const) {
    it(`calls ${name} infra-looking`, () => {
      assert.equal(hint(evidence), "infra-looking");
    });
  }

  it("calls a page error app-looking", () => {
    assert.equal(hint(quiet({ pageErrors: ["TypeError: x is undefined"] })), "app-looking");
  });

  it("calls a 500 app-looking", () => {
    assert.equal(hint(quiet({ errorResponses: [response(500)] })), "app-looking");
  });

  it("calls a wrong value app-looking", () => {
    const error = 'Error: Timed out 5000ms waiting for expect(locator).toHaveText(expected)\n\nExpected string: "1"\nReceived string: "0"';
    assert.equal(hint(quiet(), error), "app-looking");
  });

  it("doesn't count a missing element as a wrong value", () => {
    const error = "Error: Timed out 5000ms waiting for expect(locator).toBeVisible()\n\nReceived: <element(s) not found>";
    assert.equal(hint(quiet(), error), "unclear");
  });

  it("lets network trouble outweigh app signs", () => {
    assert.equal(hint(quiet({ pageErrors: ["TypeError"], errorResponses: [response(503)] })), "infra-looking");
  });
});

describe("the report", () => {
  const entry = (outcome: Entry["outcome"]): Entry => ({
    title: "smoke › smoke/smoke.spec.ts › the page | loads",
    outcome,
    location: "smoke/smoke.spec.ts:6",
    attempt: { status: "failed", error: "Error: boom", evidence: quiet({ errorResponses: [response(503)] }) },
    retryNote: outcome === "flaky" ? "passed 1 min later" : "failed again",
  });

  it("says so when every test passed first time", () => {
    assert.match(buildReport([], { tracesUploaded: false }), /every test passed on its first attempt/);
  });

  it("lists retries and failures with their hints and evidence", () => {
    const report = buildReport([entry("flaky"), entry("unexpected")], { tracesUploaded: true });
    assert.match(report, /1 passed only on retry \(informational, doesn't block\), 1 failed/);
    assert.match(report, /\*\*infra-looking\*\*/);
    assert.match(report, /GET \/api\/notes\/1 → 503 after 0\.3 s/);
    assert.match(report, /the page \\\| loads/); // pipes can't break the table
    assert.match(report, /frozen-traces/);
  });
});
