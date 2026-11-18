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

  it("names the test closest to its own budget", () => {
    const withBudget = (calls: number, budget: number) => ({
      retry: 0,
      annotations: [
        { type: "api-calls", description: String(calls) },
        { type: "api-budget", description: String(budget) },
      ],
    });
    const report = {
      specs: [
        { tests: [{ projectName: "acceptance", results: [withBudget(18, 50)] }] },
        { tests: [{ projectName: "acceptance", results: [withBudget(21, 25)] }] },
        { tests: [{ projectName: "smoke", results: [withBudget(49, 50)] }] },
      ],
    };
    const calls = countApiCalls(testsFromReport(report));
    assert.deepEqual(calls.busiest, { calls: 21, budget: 25 });
    assert.equal(
      describeApiCalls(calls),
      "API calls by acceptance tests: 39. Busiest test: 21 of its 25 budget (84%). Over 80%, so that test is close to its apiBudget.",
    );
  });

  it("leaves out the busiest test when no budget was recorded", () => {
    assert.equal(describeApiCalls(countApiCalls(testsFromReport({ specs: [{ tests: [{ projectName: "acceptance", results: [result(3)] }] }] }))), "API calls by acceptance tests: 3.");
  });
});
