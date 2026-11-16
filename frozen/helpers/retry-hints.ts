// Turns a failed attempt's evidence into a hint and a PR comment (Q40, Q66).
// The rules come from docs/research-flaky-or-real-failures.md and are
// unvalidated, so they say "looks like", show the evidence, default to
// `unclear`, and never block anything. Tune them in the retro.
import type { Evidence } from "./evidence.ts";

// pace-looking: calls were held back mid-test to stay under the rate limit, then
// the test timed out. Each test reserves its budget first, so it went over its own
// apiBudget: either the page makes more calls than it needs, or the test needs more.
export type Hint = "pace-looking" | "infra-looking" | "app-looking" | "unclear";

export type FailedAttempt = {
  status: string; // "failed" or "timedOut"
  error: string; // the first error's message, without colour codes
  evidence: Evidence | null;
  pacedMs?: number; // how long the fixture held calls back, from its `paced` annotations
  apiCalls?: number; // calls the test made, from its `api-calls` annotation
};

export type Entry = {
  title: string; // project › file › title
  outcome: "flaky" | "unexpected";
  location: string; // file:line of the first error
  attempt: FailedAttempt;
  retryNote: string; // "passed 2 min later" or "failed again"
};

const SLOW_MS = 10_000;
const GATEWAY_ERRORS = new Set([502, 503, 504]);

export function hintFor(attempt: FailedAttempt): { hint: Hint; reason: string } {
  const evidence = attempt.evidence;
  const timedOut = attempt.status === "timedOut" || /timed? ?out/i.test(attempt.error);
  if (timedOut && (attempt.pacedMs ?? 0) > 0) {
    return {
      hint: "pace-looking",
      reason: `calls were held back ${seconds(attempt.pacedMs ?? 0)} for the rate limit before it timed out`,
    };
  }
  if (!evidence) return { hint: "unclear", reason: "no evidence was recorded" };

  const infra: string[] = [];
  if (evidence.failedRequests.length > 0) infra.push("a request got no response");
  // A test that floods the API on purpose makes its own 429s (#46's attempt 1).
  if (!evidence.allow429 && evidence.errorResponses.some((r) => r.status === 429)) infra.push("a 429");
  if (evidence.errorResponses.some((r) => GATEWAY_ERRORS.has(r.status))) infra.push("a 502, 503 or 504");
  if (evidence.errorResponses.some((r) => r.headers["cf-mitigated"])) infra.push("a Cloudflare challenge");
  if ((evidence.slowest?.elapsedMs ?? 0) > SLOW_MS) infra.push("a request slower than 10 s");
  if (infra.length > 0) return { hint: "infra-looking", reason: infra.join(", ") };

  const app: string[] = [];
  if (evidence.pageErrors.length > 0) app.push("a page error");
  if (evidence.errorResponses.some((r) => r.status === 500)) app.push("a 500 from the app");
  if (receivedConcreteValue(attempt.error)) app.push("an element or value was there but wrong");
  if (app.length > 0) return { hint: "app-looking", reason: `${app.join(", ")}, with no network trouble` };

  if (timedOut) {
    return {
      hint: "unclear",
      reason: "timed out with no failed or slow requests seen, which slightly favours an app or test cause",
    };
  }
  return { hint: "unclear", reason: "nothing in the evidence points either way" };
}

// Playwright prints "Received: ..." or "Received string: ...". A missing element
// isn't a concrete value, because a slow page looks the same.
function receivedConcreteValue(error: string): boolean {
  const match = /^Received(?: [a-z]+)?:\s*(.+)$/im.exec(error);
  const value = match?.[1]?.trim() ?? "";
  return value !== "" && !/not found|^undefined$|^""$/.test(value);
}

export function summariseEvidence(evidence: Evidence | null, attempt: Pick<FailedAttempt, "pacedMs" | "apiCalls"> = {}): string {
  const parts: string[] = [];
  if ((attempt.pacedMs ?? 0) > 0) parts.push(`calls held back ${seconds(attempt.pacedMs ?? 0)} for the rate limit`);
  if (attempt.apiCalls !== undefined) parts.push(`${attempt.apiCalls} API calls`);
  if (!evidence) return [...parts, "no evidence recorded"].join("; ");
  const counted = parts.length;
  for (const r of evidence.failedRequests.slice(0, 3)) parts.push(`${r.method} ${r.path} got no response (${r.error})`);
  for (const r of evidence.errorResponses.slice(0, 3)) {
    const time = r.elapsedMs === null ? "" : ` after ${seconds(r.elapsedMs)}`;
    const headers = Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join(", ");
    const expected = r.status === 429 && evidence.allow429 ? ", expected by this test" : "";
    parts.push(`${r.method} ${r.path} → ${r.status}${time}${headers ? ` (${headers})` : ""}${expected}`);
  }
  const more = evidence.failedRequests.length + evidence.errorResponses.length - (parts.length - counted) + evidence.dropped;
  if (more > 0) parts.push(`${more} more`);
  if (evidence.pageErrors.length > 0) parts.push(`${evidence.pageErrors.length} page error(s): ${evidence.pageErrors[0]}`);
  if (evidence.slowest && evidence.slowest.elapsedMs > SLOW_MS) {
    parts.push(`slowest ${evidence.slowest.method} ${evidence.slowest.path} ${seconds(evidence.slowest.elapsedMs)}`);
  }
  return parts.length > counted ? parts.join("; ") : [...parts, "no failed or slow requests, no page errors"].join("; ");
}

export function buildReport(entries: Entry[], options: { tracesUploaded: boolean; apiCalls?: string }): string {
  const flaky = entries.filter((e) => e.outcome === "flaky");
  const failed = entries.filter((e) => e.outcome === "unexpected");
  const callsLine = options.apiCalls ? `\n${options.apiCalls}\n` : "";
  if (entries.length === 0) return `### Frozen tests: every test passed on its first attempt\n${callsLine}`;

  const lines: string[] = [];
  const heading = [
    flaky.length > 0 ? `${flaky.length} passed only on retry (informational, doesn't block)` : "",
    failed.length > 0 ? `${failed.length} failed` : "",
  ].filter(Boolean);
  lines.push(`### Frozen tests: ${heading.join(", ")}`, "");
  lines.push("Hints come from the failed attempt and aren't verdicts. Open the traces before dismissing a retry.", "");
  lines.push("| Test | First attempt failed at | Network and page during it | Hint | Retry |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const entry of [...failed, ...flaky]) {
    const { hint, reason } = hintFor(entry.attempt);
    lines.push(
      `| ${cell(entry.title)} | ${cell(`${firstErrorLine(entry.attempt.error)} (${entry.location})`)} | ${cell(summariseEvidence(entry.attempt.evidence, entry.attempt))} | **${hint}** (${cell(reason)}) | ${cell(entry.retryNote)} |`,
    );
  }
  lines.push("");
  if (entries.some((e) => hintFor(e.attempt).hint === "pace-looking")) {
    lines.push(
      "**pace-looking:** API calls were held back mid-test. Each test reserves its `apiBudget` before it starts, so this test went over its own budget. If the page makes more calls than it needs, that's the app. If the test's own steps need more, the frozen test needs a bigger `apiBudget`, and no change to the app fixes it.",
      "",
    );
  }
  if (options.apiCalls) lines.push(options.apiCalls, "");
  if (entries.length > 1) lines.push(`${entries.length} tests failed at least once in this run. Several in one run points more to infrastructure.`, "");
  lines.push(
    options.tracesUploaded
      ? "Traces of each attempt are in this run's `frozen-traces` artifact, kept 7 days."
      : "No traces were uploaded for this target.",
  );
  return `${lines.join("\n")}\n`;
}

// The error's first line, plus the Received line when Playwright gives one.
function firstErrorLine(error: string): string {
  const lines = error.split("\n").map((l) => l.trim()).filter(Boolean);
  const received = lines.find((l) => /^Received/.test(l));
  return [lines[0] ?? "no error message", received].filter(Boolean).join(" ").slice(0, 240);
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").replace(/`/g, "'");
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}
