import assert from "node:assert/strict";
import { test } from "node:test";
import { check, citedSections, contractIds } from "./attempt-preflight.mjs";

const body =
  "## Problem\nC9 here doesn't count.\n\n## Constraints every ticket needs\n\n- CSP\n\n## Test contract\n\n- **C1** GET /api/x\n- C2: page shows y\n\n## After\n- C3 no\n";

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

const sliced = "## Inputs\n\n### Routes\n\n#### POST /api/chat\n\n" + body;

test("reads a ticket's spec sections", () => {
  const ticket =
    "## What to build\nx\n\n## Spec sections\n\n- `Inputs › Routes › POST /api/chat`\n- `Inputs › Missing`\n\n## Blocked by\n- `Not this`\n";
  assert.deepEqual(citedSections(ticket), ["Inputs › Routes › POST /api/chat", "Inputs › Missing"]);
  assert.deepEqual(citedSections("no list"), []);
});

test("stops on a cited section the spec doesn't have", () => {
  const ticket =
    "## Spec sections\n- `Inputs › Routes › POST /api/chat`\n- `Inputs › Missing`\nC1 C2";
  const { problems, warnings } = check({
    body: sliced,
    tickets: [{ number: 7, state: "open" }],
    frozenText: "@C1",
    ticketBodies: [ticket],
  });
  assert.deepEqual(problems, ["Ticket #7 cites spec sections that don't exist: Inputs › Missing."]);
  assert.deepEqual(warnings, []);
});

test("warns when the spec has no constraints section", () => {
  const { warnings } = check({
    body: "## Test contract\n\n- **C1** x\n- **C2** y\n",
    tickets: [{ number: 5, state: "open" }],
    frozenText: "@C1",
    ticketBodies: ["C1 C2"],
  });
  assert.match(warnings[0], /no `## Constraints every ticket needs`/);
});
