// Totals the API calls a run made, from the `api-calls` annotation the fixture adds
// to every test. /acceptance runs it after checking new tests: the whole suite must
// stay well under PACE (100 a minute), or pacing starts holding calls back long
// enough to time out page assertions. Above the limit, /acceptance stops and asks
// the user, instead of raising timeouts or the rate limit.
//
// Usage: node helpers/api-calls.ts [reports/results.json]
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const API_CALLS_ANNOTATION = "api-calls";
export const SUITE_CALL_LIMIT = 80;

type Annotation = { type: string; description?: string };
type Node = {
  suites?: Node[];
  specs?: { tests?: { results?: { annotations?: Annotation[] }[] }[] }[];
};

// Sums the annotation over every attempt of every test, retries included, since
// each attempt's calls count against the rate limit.
export function totalApiCalls(report: Node): number {
  const own = (report.specs ?? []).flatMap((spec) =>
    (spec.tests ?? []).flatMap((test) => (test.results ?? []).flatMap((result) => result.annotations ?? [])),
  );
  const calls = own
    .filter((annotation) => annotation.type === API_CALLS_ANNOTATION)
    .reduce((sum, annotation) => sum + Number(annotation.description ?? 0), 0);
  return calls + (report.suites ?? []).reduce((sum, suite) => sum + totalApiCalls(suite), 0);
}

function main(): void {
  const file = process.argv[2] ?? join(import.meta.dirname, "..", "reports", "results.json");
  const total = totalApiCalls(JSON.parse(readFileSync(file, "utf8")) as Node);
  console.log(`API calls this run: ${total} (limit ${SUITE_CALL_LIMIT}).`);
  if (total > SUITE_CALL_LIMIT) {
    console.log("Over the limit: stop and ask the user. Don't raise timeouts or the rate limit.");
    process.exit(1);
  }
}

if (import.meta.main) main();
