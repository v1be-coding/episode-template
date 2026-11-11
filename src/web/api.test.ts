import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  failureText,
  limitMessage,
  parseRetryAfter,
  RateLimitedError,
} from "./api.js";

const respond = (status: number, body: string, headers: Record<string, string> = {}) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status, headers })));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("returns the JSON body", async () => {
    respond(200, '{"status":"ok"}');

    expect(await api("/api/health")).toEqual({ status: "ok" });
  });

  it("turns the app's 429 into a wait and a reason", async () => {
    respond(429, '{"error":"rate_limited"}', { "retry-after": "42" });

    const error = await api("/api/health").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error).toMatchObject({ retryAfterSeconds: 42, reason: "rate_limited" });
  });

  it("copes with a 429 that isn't JSON, such as Cloudflare's", async () => {
    respond(429, "<html>blocked</html>");

    await expect(api("/api/health")).rejects.toMatchObject({
      retryAfterSeconds: 60,
      reason: "unknown",
    });
  });

  it("reports other failures with their status", async () => {
    respond(500, "oops");

    const error = await api("/api/health").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500 });
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds", () => {
    expect(parseRetryAfter("7")).toBe(7);
  });

  it("reads an HTTP date", () => {
    const now = Date.UTC(2026, 10, 7, 12, 0, 0);

    expect(parseRetryAfter("Sat, 07 Nov 2026 12:00:30 GMT", now)).toBe(30);
  });

  it("falls back to a minute", () => {
    expect(parseRetryAfter(null)).toBe(60);
    expect(parseRetryAfter("soon")).toBe(60);
  });
});

describe("limitMessage", () => {
  it("tells a limited visitor when to try again", () => {
    expect(limitMessage(new RateLimitedError(42, "rate_limited"))).toBe(
      "Too many requests. Try again in 42 seconds.",
    );
  });

  it("says when the AI feature has paused for the day", () => {
    expect(limitMessage(new RateLimitedError(3600, "daily_cap"))).toBe(
      "The AI feature is paused until tomorrow.",
    );
  });
});

describe("failureText", () => {
  it("shows the limit message for a rate-limited request", () => {
    expect(failureText(new RateLimitedError(30, "rate_limited"))).toBe(
      "Too many requests. Try again in 30 seconds.",
    );
  });

  it.each([
    ["an error status", new ApiError(404)],
    ["no response", new TypeError("Failed to fetch")],
  ])("says unavailable for %s", (_name, error) => {
    expect(failureText(error)).toBe("unavailable");
  });
});
