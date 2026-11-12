// The frozen lint (Q39, Q64). CI runs this copy from main's commit in the PR's merge, so a
// run can't loosen it. Agent-written Playwright tests have been seen returning
// early or skipping and still passing, so a frozen test must be one straight
// line of steps and assertions. Shared logic that needs branches belongs in
// helpers/, which is exempt.
//
// Usage: node helpers/lint.ts [folder]   (defaults to the folder above helpers/)
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

export type Finding = { file: string; line: number; message: string };

const SKIPPED_FOLDERS = new Set(["helpers", "node_modules", "test-results", "reports", "playwright-report"]);
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

// Marks that turn a test off or flip its result.
const BANNED_MODIFIERS: Record<string, string> = {
  skip: "`.skip` turns a test off",
  only: "`.only` turns every other test off",
  fixme: "`.fixme` turns a test off",
  fail: "`.fail` makes a failing test pass",
};

const EXPECT_ROOTS = new Set(["expect", "expect.soft", "expect.poll"]);

// Lints one file's text and returns what it found. `file` is only for messages.
export function lintSource(file: string, text: string): Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const findings: Finding[] = [];
  const report = (node: ts.Node, message: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    findings.push({ file, line: line + 1, message });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node)) report(node, "`if` lets a test take a path that asserts nothing");
    if (ts.isConditionalExpression(node)) report(node, "`?:` lets a test take a path that asserts nothing");
    if (ts.isSwitchStatement(node)) report(node, "`switch` lets a test take a path that asserts nothing");
    if (ts.isTryStatement(node)) report(node, "`try` can swallow a failed assertion");
    if (ts.isReturnStatement(node)) report(node, "`return` can end a test before its assertions");
    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      const banned = BANNED_MODIFIERS[name];
      if (banned) report(node.name, banned);
      if (name === "catch" && ts.isCallExpression(node.parent) && node.parent.expression === node) {
        report(node.name, "`.catch()` can swallow a failed assertion");
      }
    }
    if (isTestCall(node)) {
      const body = node.arguments.at(-1);
      if (body && isFunction(body) && !containsAssertion(body)) {
        report(node, "this test has no `expect(...)` assertion");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

// Lints every source file under `folder`, apart from the exempt folders.
export function lintFolder(folder: string): Finding[] {
  return sourceFiles(folder).flatMap((path) =>
    lintSource(relative(process.cwd(), path), readFileSync(path, "utf8")),
  );
}

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return SKIPPED_FOLDERS.has(entry.name) ? [] : sourceFiles(path);
    return SOURCE_FILE.test(entry.name) ? [path] : [];
  });
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith("x")) return ts.ScriptKind.TSX;
  return /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

// `test("title", fn)` or `test("title", details, fn)`, but not `test.use(...)`
// or `test.describe(...)`, which hold no assertions of their own.
function isTestCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "test";
}

function isFunction(node: ts.Node): node is ts.ArrowFunction | ts.FunctionExpression {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

// An assertion is a matcher called on expect(...), expect.soft(...) or
// expect.poll(...), such as `expect(x).toBe(1)` or `expect(x).not.toBe(1)`.
// A bare `expect(x)` asserts nothing.
function containsAssertion(node: ts.Node): boolean {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    let target: ts.Expression = node.expression.expression;
    while (ts.isPropertyAccessExpression(target)) target = target.expression;
    if (ts.isCallExpression(target) && EXPECT_ROOTS.has(target.expression.getText())) return true;
  }
  return ts.forEachChild(node, containsAssertion) ?? false;
}

function main(): void {
  const folder = resolve(process.argv[2] ?? join(import.meta.dirname, ".."));
  const findings = lintFolder(folder);
  for (const { file, line, message } of findings) {
    // A GitHub annotation, which also reads well in a terminal.
    console.log(`::error file=${file},line=${line}::${message}`);
  }
  if (findings.length > 0) {
    console.log(`\nThe frozen lint found ${findings.length} problem(s). See frozen/README.md.`);
    process.exit(1);
  }
  console.log(`The frozen lint passed: ${relative(process.cwd(), folder) || "."}`);
}

if (import.meta.main) main();
