import assert from "node:assert/strict";
import { test } from "node:test";
import { check, contractIds } from "./attempt-preflight.mjs";

const body =
  "## Problem\nC9 here doesn't count.\n\n## Test contract\n\n- **C1** GET /api/x\n- C2: page shows y\n\n## After\n- C3 no\n";

test("reads only the Test contract section's C-lines", () => {
  assert.deepEqual(contractIds(body), ["C1", "C2"]);
  assert.equal(contractIds("## Other\n- C1"), null);
});

test("ready when frozen tests are tagged and tickets are open", () => {
  const result = check({
    body,
    tickets: [{ number: 5, state: "open" }],
    frozenText: 'test("C1: x", { tag: ["@C1"] })',
    ticketBodies: ["Covers C1 and C2."],
  });
  assert.deepEqual(result, { problems: [], warnings: [] });
});

test("stops with every problem at once", () => {
  const { problems } = check({
    body: "no contract",
    tickets: [],
    frozenText: "",
    ticketBodies: [],
  });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /Run \/acceptance first/);
  assert.match(problems[1], /Run \/to-tickets/);
});

test("stops when the frozen PR isn't merged, or every ticket is closed", () => {
  const { problems } = check({
    body,
    tickets: [{ number: 5, state: "closed" }],
    frozenText: "@C10",
    ticketBodies: ["C1 C2"],
  });
  assert.match(problems[0], /Merge \/acceptance's frozen PR/);
  assert.match(problems[1], /All 1 tickets are closed/);
});

test("warns, without stopping, when no ticket cites a contract line", () => {
  const result = check({
    body,
    tickets: [{ number: 5, state: "open" }],
    frozenText: "@C1",
    ticketBodies: ["C1 only"],
  });
  assert.deepEqual(result, { problems: [], warnings: ["No ticket cites C2."] });
});
