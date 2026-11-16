// Run with: npm run test:helpers
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countApiCalls, describeApiCalls, testsFromReport } from "../api-calls.ts";

const result = (calls: number, retry = 0, other: { type: string; description?: string }[] = []) => ({
  retry,
  annotations: [...other, { type: "api-calls", description: String(calls) }],
});

describe("api calls", () => {
  it("counts acceptance tests only, across nested suites, with retries apart", () => {
    const report = {
      suites: [
        {
          specs: [{ tests: [{ projectName: "acceptance", status: "expected", results: [result(2)] }] }],
          suites: [
            {
              specs: [
                { tests: [{ projectName: "acceptance", status: "flaky", results: [result(5), result(4, 1)] }] },
                { tests: [{ projectName: "smoke", status: "expected", results: [result(30)] }] },
                { tests: [{ projectName: "rate-limit", status: "expected", results: [result(3)] }] },
              ],
            },
          ],
        },
      ],
    };
    assert.deepEqual(countApiCalls(testsFromReport(report)), { firstAttempts: 7, withRetries: 11, failedTests: 0, tests: 2 });
  });

  it("ignores other annotations", () => {
    const report = {
      specs: [{ tests: [{ projectName: "acceptance", results: [result(3, 0, [{ type: "paced", description: "waited 10 ms" }])] }] }],
    };
    assert.equal(countApiCalls(testsFromReport(report)).firstAttempts, 3);
  });

  it("is zero for an empty report", () => {
    assert.deepEqual(countApiCalls(testsFromReport({})), { firstAttempts: 0, withRetries: 0, failedTests: 0, tests: 0 });
  });

  it("calls the count a floor when tests failed", () => {
    const text = describeApiCalls({ firstAttempts: 12, withRetries: 12, failedTests: 3, tests: 4 });
    assert.match(text, /^API calls by acceptance tests: 12\. 3 of 4 tests failed/);
  });

  it("has no suite limit, as each test reserves its budget", () => {
    const text = describeApiCalls({ firstAttempts: 300, withRetries: 310, failedTests: 0, tests: 60 });
    assert.equal(text, "API calls by acceptance tests: 300, 310 counting retries.");
  });
});
