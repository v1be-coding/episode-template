// Checks that every Routes and Page line of a spec's test contract is tagged by at
// least one test, so a line can't quietly go untested. Lines under "Data that must
// already exist" and "Test IDs" are exempt: tests use them rather than check them.
//
// Usage: node helpers/contract-coverage.ts <spec-body.md> <test file>...
import { readFileSync } from "node:fs";

const CHECKED_SECTIONS = new Set(["routes", "page"]);

// The C-numbers under the contract's Routes and Page headings.
export function checkedLines(specBody: string): string[] {
  const contract = specBody.split(/^## Test contract\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const lines: string[] = [];
  let section = "";
  for (const line of contract.split("\n")) {
    const heading = /^### (.+?)\s*$/.exec(line);
    if (heading) section = (heading[1] ?? "").toLowerCase();
    const item = /^\s*[-*]\s+\*\*(C\d+):\*\*/.exec(line);
    if (item?.[1] && CHECKED_SECTIONS.has(section)) lines.push(item[1]);
  }
  return lines;
}

// The C-numbers named in `@C<n>` tags.
export function taggedLines(testSource: string): Set<string> {
  return new Set([...testSource.matchAll(/["'`]@(C\d+)["'`]/g)].map((match) => match[1] ?? ""));
}

export function uncovered(specBody: string, testSources: string[]): string[] {
  const tagged = new Set(testSources.flatMap((source) => [...taggedLines(source)]));
  return checkedLines(specBody).filter((line) => !tagged.has(line));
}

function main(): void {
  const [specFile, ...testFiles] = process.argv.slice(2);
  if (!specFile || testFiles.length === 0) {
    console.log("Usage: node helpers/contract-coverage.ts <spec-body.md> <test file>...");
    process.exit(2);
  }
  const spec = readFileSync(specFile, "utf8");
  const checked = checkedLines(spec);
  if (checked.length === 0) {
    console.log("No Routes or Page lines found under `## Test contract`.");
    process.exit(1);
  }
  const missing = uncovered(
    spec,
    testFiles.map((file) => readFileSync(file, "utf8")),
  );
  if (missing.length > 0) {
    console.log(`Contract lines with no tagged test: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`Every Routes and Page line has a tagged test: ${checked.join(", ")}`);
}

if (import.meta.main) main();
