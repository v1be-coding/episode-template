// Run with: npm run test:helpers
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lintSource } from "../lint.ts";

const messages = (text: string) => lintSource("example.spec.ts", text).map((f) => f.message);

const passing = `
import { expect, test } from "../helpers/fixtures.js";
test.use({ allow429: true });
test.describe("notes", () => {
  test("saves a note", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("API: ok")).toBeVisible();
    expect(await page.title()).not.toBe("");
  });
});
`;

describe("the frozen lint", () => {
  it("passes a straight-line test with an assertion", () => {
    assert.deepEqual(messages(passing), []);
  });

  it("ignores the banned words in comments, strings and titles", () => {
    const text = `test("if it fails, try again or return", async ({ page }) => {
      // if this skips, try harder
      await expect(page.getByText("return only on skip")).toBeVisible();
    });`;
    assert.deepEqual(messages(text), []);
  });

  for (const [name, body, expected] of [
    ["if", "if (x) await expect(a).toBe(1);", "`if`"],
    ["a ternary", "await expect(x ? a : b).toBe(1);", "`?:`"],
    ["switch", "switch (x) { default: expect(a).toBe(1); }", "`switch`"],
    ["try", "try { expect(a).toBe(1); } catch {}", "`try`"],
    ["an early return", "return; expect(a).toBe(1);", "`return`"],
    [".catch()", "await page.goto('/').catch(() => {}); expect(a).toBe(1);", "`.catch()`"],
  ] as const) {
    it(`rejects ${name}`, () => {
      const found = messages(`test("t", async ({ page }) => { ${body} });`);
      assert.ok(found.some((m) => m.startsWith(expected)), found.join("\n"));
    });
  }

  for (const modifier of ["skip", "only", "fixme", "fail"]) {
    it(`rejects .${modifier}`, () => {
      assert.ok(messages(`test.${modifier}("t", async () => { expect(1).toBe(1); });`).length > 0);
      assert.ok(messages(`test.describe.${modifier}("d", () => {});`).length > 0);
      assert.ok(messages(`test("t", async () => { test.${modifier}(); expect(1).toBe(1); });`).length > 0);
    });
  }

  it("rejects a test with no assertion", () => {
    assert.deepEqual(messages(`test("t", async ({ page }) => { await page.goto("/"); });`), [
      "this test has no `expect(...)` assertion",
    ]);
  });

  it("doesn't count a bare expect(x) as an assertion", () => {
    assert.equal(messages(`test("t", async () => { expect(1); });`).length, 1);
  });

  it("counts expect.soft and expect.poll as assertions", () => {
    assert.deepEqual(messages(`test("t", async () => { expect.soft(1).toBe(1); });`), []);
    assert.deepEqual(messages(`test("t", async () => { await expect.poll(() => 1).toBe(1); });`), []);
  });

  it("accepts a test with a details object", () => {
    assert.deepEqual(messages(`test("t", { tag: "@x" }, async () => { expect(1).toBe(1); });`), []);
  });

  it("reports the line of each problem", () => {
    const [finding] = lintSource("a.spec.ts", `test("t", async () => {\n  expect(1).toBe(1);\n  if (x) {}\n});`);
    assert.equal(finding?.line, 3);
  });
});
