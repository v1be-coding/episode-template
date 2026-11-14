// Lists every frozen test that needed its one retry (Q40) or failed, with the
// failed attempt's evidence and a hint (Q66). It writes:
//   reports/retry-report.md    for the job summary and the PR comment
//   reports/retry-report.json  counts the workflow reads to decide on a comment
// It also prints the acceptance tests' API-call count, so /attempt finds it in the
// job log of a passing run too.
// The workflow sets FROZEN_TRACES=uploaded on branch environments.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { FullConfig, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { API_CALLS_ANNOTATION, countApiCalls, describeApiCalls } from "./api-calls.js";
import { EVIDENCE_ATTACHMENT, type Evidence } from "./evidence.js";
import { buildReport, type Entry } from "./retry-hints.js";

const ANSI = /\u001b\[[0-9;]*m/g;

export default class RetryReporter implements Reporter {
  private root = process.cwd();
  private readonly tests: TestCase[] = [];

  onBegin(config: FullConfig): void {
    this.root = config.configFile ? dirname(config.configFile) : process.cwd();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // Called once per attempt, so keep each test once.
    if (result.retry === 0) this.tests.push(test);
  }

  onEnd(): void {
    const entries = this.tests.flatMap((test) => {
      const outcome = test.outcome();
      return outcome === "flaky" || outcome === "unexpected" ? [this.entryFor(test, outcome)] : [];
    });
    const folder = join(this.root, "reports");
    mkdirSync(folder, { recursive: true });
    const calls = countApiCalls(
      this.tests.map((test) => ({
        project: test.parent.project()?.name,
        failed: test.outcome() === "unexpected",
        results: test.results.map((result) => ({ retry: result.retry, annotations: result.annotations })),
      })),
    );
    const apiCalls = calls.tests > 0 ? describeApiCalls(calls) : undefined;
    if (apiCalls) console.log(`\n${apiCalls}`);
    const markdown = buildReport(entries, { tracesUploaded: process.env.FROZEN_TRACES === "uploaded", apiCalls });
    writeFileSync(join(folder, "retry-report.md"), markdown);
    writeFileSync(
      join(folder, "retry-report.json"),
      JSON.stringify({
        flaky: entries.filter((e) => e.outcome === "flaky").length,
        failed: entries.filter((e) => e.outcome === "unexpected").length,
        apiCalls: calls.firstAttempts,
      }),
    );
  }

  private entryFor(test: TestCase, outcome: "flaky" | "unexpected"): Entry {
    // The first attempt that didn't pass, and whatever came after it.
    const results = test.results;
    const failedIndex = Math.max(0, results.findIndex((r) => r.status !== "passed" && r.status !== "skipped"));
    const failed = results[failedIndex] as TestResult;
    const next = results[failedIndex + 1];
    const error = failed.errors[0];
    const where = error?.location ?? test.location;
    const gapSeconds = next ? Math.round((next.startTime.getTime() - failed.startTime.getTime()) / 1000) : 0;
    const gap = gapSeconds < 120 ? `${gapSeconds} s` : `${Math.round(gapSeconds / 60)} min`;

    return {
      title: [test.parent.project()?.name, ...test.titlePath().slice(2)].filter(Boolean).join(" › "),
      outcome,
      location: `${relative(this.root, where.file)}:${where.line}`,
      attempt: {
        status: failed.status,
        error: (error?.message ?? "").replace(ANSI, ""),
        evidence: evidenceOf(failed),
        pacedMs: failed.annotations
          .filter((a) => a.type === "paced")
          .reduce((sum, a) => sum + Number(/(\d+) ms/.exec(a.description ?? "")?.[1] ?? 0), 0),
        apiCalls: apiCallsOf(failed),
      },
      retryNote: !next ? "no retry ran" : next.status === "passed" ? `passed ${gap} later` : "failed again",
    };
  }
}

function apiCallsOf(result: TestResult): number | undefined {
  const annotation = result.annotations.find((a) => a.type === API_CALLS_ANNOTATION);
  return annotation ? Number(annotation.description ?? 0) : undefined;
}

function evidenceOf(result: TestResult): Evidence | null {
  const attachment = result.attachments.find((a) => a.name === EVIDENCE_ATTACHMENT);
  if (!attachment?.body) return null;
  try {
    return JSON.parse(attachment.body.toString("utf8")) as Evidence;
  } catch {
    return null;
  }
}
