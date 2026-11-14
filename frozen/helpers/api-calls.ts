// Counts the API calls the acceptance tests made, from the `api-calls` annotation
// the fixture adds to every test. The suite must stay well under PACE (100 a
// minute), or pacing holds calls back long enough to time out page assertions.
//
// Two places read it:
// - /acceptance runs this file after checking new tests. Above the limit it stops
//   and asks the user, instead of raising timeouts or the rate limit.
// - The retry reporter prints the same line on every CI run, so /attempt sees the
//   real count once the tests pass. On `main` new tests fail early, so there the
//   count is a floor.
//
// Usage: node helpers/api-calls.ts [reports/results.json]
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const API_CALLS_ANNOTATION = "api-calls";
export const SUITE_CALL_LIMIT = 80;
// Smoke tests run before every suite and the rate-limit check waits out its own
// window, so only the acceptance tests count against the limit.
export const COUNTED_PROJECT = "acceptance";

type Annotation = { type: string; description?: string };
export type CountedTest = {
  project: string | undefined;
  failed: boolean; // never passed, so it stopped early
  results: { retry: number; annotations: Annotation[] }[];
};
export type ApiCalls = { firstAttempts: number; withRetries: number; failedTests: number; tests: number };

export function countApiCalls(tests: CountedTest[]): ApiCalls {
  const counted = tests.filter((test) => test.project === COUNTED_PROJECT);
  const callsIn = (result: CountedTest["results"][number]) =>
    result.annotations
      .filter((annotation) => annotation.type === API_CALLS_ANNOTATION)
      .reduce((sum, annotation) => sum + Number(annotation.description ?? 0), 0);
  const results = counted.flatMap((test) => test.results);
  return {
    firstAttempts: results.filter((r) => r.retry === 0).reduce((sum, r) => sum + callsIn(r), 0),
    withRetries: results.reduce((sum, r) => sum + callsIn(r), 0),
    failedTests: counted.filter((test) => test.failed).length,
    tests: counted.length,
  };
}

// One line for logs and reports, plus what to make of it.
export function describeApiCalls(calls: ApiCalls): string {
  if (calls.tests === 0) return "API calls by acceptance tests: none ran.";
  const retries = calls.withRetries > calls.firstAttempts ? `, ${calls.withRetries} counting retries` : "";
  const parts = [`API calls by acceptance tests: ${calls.firstAttempts} (limit ${SUITE_CALL_LIMIT})${retries}.`];
  if (calls.failedTests > 0) {
    parts.push(`${calls.failedTests} of ${calls.tests} tests failed and stopped early, so the real count is higher.`);
  }
  if (calls.firstAttempts > SUITE_CALL_LIMIT) {
    parts.push("Over the limit: the frozen tests make too many calls. Stop and ask the user. Don't raise timeouts, the pace or the rate limit.");
  }
  return parts.join(" ");
}

// Playwright's JSON report, as much of it as this needs.
type ReportNode = {
  suites?: ReportNode[];
  specs?: {
    tests?: { projectName?: string; status?: string; results?: { retry?: number; annotations?: Annotation[] }[] }[];
  }[];
};

export function testsFromReport(report: ReportNode): CountedTest[] {
  const own = (report.specs ?? []).flatMap((spec) =>
    (spec.tests ?? []).map((test) => ({
      project: test.projectName,
      failed: test.status === "unexpected",
      results: (test.results ?? []).map((result) => ({ retry: result.retry ?? 0, annotations: result.annotations ?? [] })),
    })),
  );
  return [...own, ...(report.suites ?? []).flatMap(testsFromReport)];
}

function main(): void {
  const file = process.argv[2] ?? join(import.meta.dirname, "..", "reports", "results.json");
  const calls = countApiCalls(testsFromReport(JSON.parse(readFileSync(file, "utf8")) as ReportNode));
  console.log(describeApiCalls(calls));
  if (calls.firstAttempts > SUITE_CALL_LIMIT) process.exit(1);
}

if (import.meta.main) main();
