// Formats each file Claude edits with Prettier, so `npm run format:check` passes
// without a fix-up. In episode 1, 8 implementers each spent about 3 calls running
// the check, seeing it fail and running `npx prettier --write`. Claude Code runs
// this after each Edit or Write. It never blocks: a file Prettier can't parse
// mid-change is left alone, and the check still runs before commit and in CI.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The checkout holding the file, found by its `.git` (a folder in the main
// checkout, a file in a subagent's worktree), and the file's path inside it.
// Null for frozen/ (never edited in a run), node_modules, a worktree seen from
// the main checkout, or a file in no checkout.
export function target(input, exists = existsSync) {
  const file = input?.tool_input?.file_path;
  if (typeof file !== "string" || !path.isAbsolute(file)) return null;
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (!exists(path.join(dir, ".git"))) continue;
    const relative = path.relative(dir, file);
    if (/^(frozen|node_modules|\.claude\/worktrees)(\/|$)/.test(relative)) return null;
    return { root: dir, file: relative };
  }
  return null;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  let found;
  try {
    found = target(JSON.parse(input));
  } catch {
    return;
  }
  if (!found) return;
  const prettier = path.join(found.root, "node_modules", ".bin", "prettier");
  if (!existsSync(prettier)) return;
  try {
    execFileSync(prettier, ["--write", "--ignore-unknown", "--log-level", "silent", found.file], {
      cwd: found.root,
      stdio: "ignore",
      timeout: 20_000,
    });
  } catch {
    // A parse error or timeout: leave the file as written.
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
