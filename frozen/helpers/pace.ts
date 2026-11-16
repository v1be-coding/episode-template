// Q59: frozen tests face the same per-IP limit as visitors (120 a minute), so
// every API call they make is paced instead of the limit being raised or skipped.
export const PACE = { calls: 100, windowMs: 60_000 };

// How long a call must wait to fit under PACE, given the times of earlier calls.
export function callWait(sent: readonly number[], now: number): number {
  return waitUntilAtMost(sent, now, PACE.calls - 1);
}

// How long a test must wait before it starts, so its whole budget fits under
// PACE. Then no call is held back mid-test, where the wait would time out a page
// assertion. Tests run one at a time, so only this test adds calls until it ends.
export function reservationWait(sent: readonly number[], now: number, budget: number): number {
  return waitUntilAtMost(sent, now, PACE.calls - budget);
}

// Waits until at most `room` calls are left in the trailing window. `sent` is oldest first.
function waitUntilAtMost(sent: readonly number[], now: number, room: number): number {
  const recent = sent.filter((time) => now - time < PACE.windowMs);
  const over = recent.length - Math.max(room, 0);
  if (over <= 0) return 0;
  return (recent[over - 1] ?? now) + PACE.windowMs - now;
}
