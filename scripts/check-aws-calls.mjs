// Finds AWS CLI calls in workflow scripts where a refusal would read as "none".
// Under the Budgets action's deny-all, that left both teardowns green with
// resources still running (phase F, fixed in #64). Reads files as text.
// Usage: node scripts/check-aws-calls.mjs [folder or file ...], default .github/workflows
// A line that must keep such a call says why with `# aws-refusal-ok: <reason>`
// on that line or the one above.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RULES = [
  {
    test: (cmd) => /<\s*<\(/.test(cmd),
    message: "inside < <( ), where bash -e ignores its failure, so a refusal reads as empty",
  },
  {
    test: (cmd) =>
      /(^\s*|[;&|]\s*|\bthen\s+|\bdo\s+)(if|elif|while|until)\s+(!\s*)?aws\s/.test(cmd),
    message:
      "used as a condition, so a refusal reads as false. Assign its output with `if ! x=$(aws ...)` and fail on that",
  },
  {
    test: (cmd) => /\baws\s[^|]*\|\|\s*(true|:|echo|printf|continue|exit 0)\b/.test(cmd),
    message: "has its failure swallowed with ||, so a refusal reads as success",
  },
  {
    test: (cmd) => /\baws\s+s3api\s+head-object\b/.test(cmd),
    message:
      "uses head-object, where S3 answers 403 for both a refusal and a missing key. List the key with list-objects-v2",
  },
  {
    test: (cmd) => {
      const plain = /^\s*(?:(?:local|export|readonly)\s+)?\w+=\$\(aws\s/;
      const guarded = /^\s*(?:if|elif)\s+!\s*\w+=\$\(aws\s/;
      return /\$\(aws\s/.test(cmd) && !plain.test(cmd) && !guarded.test(cmd);
    },
    message:
      "sits in $( ) inside another command, which hides its exit status. Assign it on its own line first",
  },
];

// Joins backslash-continued lines, so a call split over lines is read whole.
export function commands(text) {
  const out = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const start = i;
    let cmd = lines[i];
    while (/\\\s*$/.test(cmd) && i + 1 < lines.length)
      cmd = cmd.replace(/\\\s*$/, " ") + lines[++i];
    out.push({ line: start + 1, cmd, before: start > 0 ? lines[start - 1] : "" });
  }
  return out;
}

export function check(text) {
  const findings = [];
  for (const { line, cmd, before } of commands(text)) {
    const code = cmd.replace(/(^|\s)#.*$/, "");
    if (!/\baws\s/.test(code)) continue;
    if (/aws-refusal-ok:/.test(cmd) || /^\s*#\s*aws-refusal-ok:/.test(before)) continue;
    for (const rule of RULES)
      if (rule.test(code)) findings.push({ line, message: `This aws call ${rule.message}.` });
  }
  return findings;
}

function files(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .filter((f) => /\.(ya?ml|sh)$/.test(f))
    .map((f) => join(path, f));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const targets = process.argv.length > 2 ? process.argv.slice(2) : [".github/workflows"];
  let count = 0;
  for (const file of targets.flatMap(files)) {
    for (const f of check(readFileSync(file, "utf8"))) {
      console.log(`::error file=${file},line=${f.line}::${f.message}`);
      count++;
    }
  }
  if (count) {
    console.log(`${count} aws call(s) could read a refusal as "none". See CODING_STANDARDS.md.`);
    process.exit(1);
  }
  console.log("No aws call reads a refusal as none.");
}
