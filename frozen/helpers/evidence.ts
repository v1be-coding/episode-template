// What the network and the page did during one test attempt, for the retry
// reporter (Q66, docs: research-flaky-or-real-failures.md). It keeps the app's
// own origin only, paths without query strings, and a few allowlisted headers,
// never bodies, cookies or auth headers, because CI uploads it publicly.

export type Evidence = {
  retry: number;
  failedRequests: { method: string; path: string; error: string; atMs: number }[];
  errorResponses: {
    status: number;
    method: string;
    path: string;
    elapsedMs: number | null;
    atMs: number;
    headers: Record<string, string>;
  }[];
  slowest: { method: string; path: string; elapsedMs: number } | null;
  pageErrors: string[];
  // Entries left out once a list reached MAX_ENTRIES.
  dropped: number;
};

export const EVIDENCE_ATTACHMENT = "evidence";
const MAX_ENTRIES = 25;
const KEPT_HEADERS = ["cf-mitigated", "retry-after", "apigw-requestid"];

export class EvidenceLog {
  readonly data: Evidence;
  private readonly origin: string | null;
  private readonly startedAt = Date.now();

  constructor(baseURL: string | undefined, retry: number) {
    this.origin = baseURL ? new URL(baseURL).origin : null;
    this.data = { retry, failedRequests: [], errorResponses: [], slowest: null, pageErrors: [], dropped: 0 };
  }

  // Records a request that got no response at all.
  failed(url: string, method: string, error: string): void {
    const path = this.pathOf(url);
    if (path === null) return;
    this.push(this.data.failedRequests, { method, path, error: firstLine(error), atMs: this.now() });
  }

  // Records a finished request: its time, and the response if it's 400 or above.
  // Redirects and 304s are normal, so only 4xx and 5xx count.
  finished(url: string, method: string, status: number, elapsedMs: number | null, headers: Record<string, string>): void {
    const path = this.pathOf(url);
    if (path === null) return;
    if (elapsedMs !== null && elapsedMs > (this.data.slowest?.elapsedMs ?? -1)) {
      this.data.slowest = { method, path, elapsedMs: Math.round(elapsedMs) };
    }
    if (status < 400) return;
    const kept = Object.fromEntries(KEPT_HEADERS.flatMap((name) => (headers[name] ? [[name, headers[name]]] : [])));
    this.push(this.data.errorResponses, {
      status,
      method,
      path,
      elapsedMs: elapsedMs === null ? null : Math.round(elapsedMs),
      atMs: this.now(),
      headers: kept,
    });
  }

  pageError(message: string): void {
    this.push(this.data.pageErrors, firstLine(message));
  }

  private push<T>(list: T[], entry: T): void {
    if (list.length < MAX_ENTRIES) list.push(entry);
    else this.data.dropped += 1;
  }

  private now(): number {
    return Date.now() - this.startedAt;
  }

  // The path for the app's own origin, or null for anything else.
  private pathOf(url: string): string | null {
    const parsed = new URL(url);
    if (this.origin !== null && parsed.origin !== this.origin) return null;
    return parsed.pathname;
  }
}

function firstLine(text: string): string {
  return (text.split("\n")[0] ?? "").slice(0, 300);
}
