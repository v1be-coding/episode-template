import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PACE, callWait, reservationWait } from "../pace.ts";

const now = 1_000_000;
// `count` calls, oldest first, ending one second ago.
const calls = (count: number, spacingMs = 100) => Array.from({ length: count }, (_, i) => now - 1000 - (count - 1 - i) * spacingMs);

describe("callWait", () => {
  it("lets a call through while the window has room", () => {
    assert.equal(callWait(calls(PACE.calls - 1), now), 0);
  });

  it("waits for the oldest call to leave a full window", () => {
    const sent = calls(PACE.calls);
    assert.equal(callWait(sent, now), (sent[0] ?? 0) + PACE.windowMs - now);
  });

  it("ignores calls older than the window", () => {
    assert.equal(callWait([now - PACE.windowMs - 1, ...calls(10)], now), 0);
  });
});

describe("reservationWait", () => {
  it("starts a test at once when its whole budget fits", () => {
    assert.equal(reservationWait(calls(50), now, 50), 0);
  });

  it("waits until enough calls leave the window for the whole budget", () => {
    const sent = calls(60);
    // 60 recent calls and a budget of 50: the 10 oldest must leave first.
    assert.equal(reservationWait(sent, now, 50), (sent[9] ?? 0) + PACE.windowMs - now);
  });

  it("leaves no call to wait mid-test once the budget is reserved", () => {
    const budget = 30;
    const sent = calls(PACE.calls - budget);
    assert.equal(reservationWait(sent, now, budget), 0);
    const during = [...sent];
    for (let i = 0; i < budget; i++) {
      assert.equal(callWait(during, now + i), 0);
      during.push(now + i);
    }
  });
});
