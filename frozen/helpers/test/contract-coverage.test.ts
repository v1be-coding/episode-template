// Run with: npm run test:helpers
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkedLines, taggedLines, uncovered } from "../contract-coverage.ts";

const spec = `# Spec

Intro with **C9:** in it, which isn't the contract.

## Test contract

Written by \`/acceptance\`.

### Routes

- **C1:** \`GET /api/x\` returns \`200\`.
- **C2:** It counts every row.

### Page

- **C3:** The page shows \`X: <n>\`.

### Data that must already exist

- **C4:** A seed row.

### Test IDs

None.

## Later section

- **C5:** Not part of the contract.
`;

describe("contract coverage", () => {
  it("reads only Routes and Page lines inside the contract", () => {
    assert.deepEqual(checkedLines(spec), ["C1", "C2", "C3"]);
  });

  it("reads tags in any quote style", () => {
    assert.deepEqual([...taggedLines(`{ tag: ["@C1", '@C2', \`@C3\`] }`)], ["C1", "C2", "C3"]);
  });

  it("lists lines no test tags, across files", () => {
    assert.deepEqual(uncovered(spec, [`{ tag: ["@C1"] }`, `{ tag: "@C3" }`]), ["C2"]);
  });

  it("doesn't count a tag for C10 as one for C1", () => {
    assert.deepEqual(uncovered(spec, [`{ tag: ["@C10", "@C2", "@C3"] }`]), ["C1"]);
  });

  it("is empty when every line is tagged", () => {
    assert.deepEqual(uncovered(spec, [`["@C1", "@C2"]`, `"@C3"`]), []);
  });
});
