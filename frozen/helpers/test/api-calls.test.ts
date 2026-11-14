// Run with: npm run test:helpers
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { totalApiCalls } from "../api-calls.ts";

const result = (calls: number, other: { type: string; description?: string }[] = []) => ({
  annotations: [...other, { type: "api-calls", description: String(calls) }],
});

describe("api calls total", () => {
  it("sums every attempt across nested suites", () => {
    const report = {
      suites: [
        {
          specs: [{ tests: [{ results: [result(2)] }] }],
          suites: [{ specs: [{ tests: [{ results: [result(5), result(4)] }] }] }],
        },
      ],
    };
    assert.equal(totalApiCalls(report), 11);
  });

  it("ignores other annotations", () => {
    const report = { specs: [{ tests: [{ results: [result(3, [{ type: "paced", description: "waited 10 ms" }])] }] }] };
    assert.equal(totalApiCalls(report), 3);
  });

  it("is zero for an empty report", () => {
    assert.equal(totalApiCalls({}), 0);
  });
});
