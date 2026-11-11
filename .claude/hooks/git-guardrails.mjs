// Blocks git and gh commands a run should never need (Q12). It catches mistakes,
// not attacks: a shell can always route around it, and GitHub's branch rules are
// the real gate. Claude Code runs it before each Bash call. Exit 2 blocks.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PROTECTED = "main";

// Splits a command line into simple commands, then words, honouring quotes.
// Good enough for the commands an agent writes, not a full shell parser.
export function simpleCommands(line) {
  const commands = [];
  let words = [];
  let word = "";
  let inWord = false;
  let quote = null;
  const endWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < line.length) word += line[++i];
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === "\\" && i + 1 < line.length) {
      word += line[++i];
      inWord = true;
    } else if (/\s/.test(c)) {
      if (c === "\n") endCommand();
      else endWord();
    } else if (";&|()".includes(c)) {
      endCommand();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  // Drop leading VAR=value assignments and wrappers that run the next word.
  return commands.map((w) => {
    let i = 0;
    while (
      i < w.length &&
      (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[i]) ||
        ["env", "command", "exec", "sudo", "time"].includes(w[i]))
    )
      i++;
    return w.slice(i);
  });
}

// Skips git's global options, such as -C <dir> and -c <key=value>.
function gitSubcommand(words) {
  let i = 1;
  let dir = null;
  while (i < words.length && words[i].startsWith("-")) {
    if (words[i] === "-C") dir = words[i + 1];
    i += ["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(words[i]) ? 2 : 1;
  }
  return { sub: words[i], args: words.slice(i + 1), dir };
}

const shortFlags = (args) => args.filter((a) => /^-[A-Za-z]+$/.test(a)).join("");

function pushProblem(args, currentBranch) {
  const flags = shortFlags(args);
  if (
    args.some((a) => /^--(force|force-with-lease|force-if-includes)(=|$)/.test(a)) ||
    flags.includes("f")
  )
    return "Force pushes are blocked. Push a new commit instead.";
  if (args.includes("--mirror") || args.includes("--all"))
    return "Pushing every branch is blocked. Push only your own branch.";
  const positional = args.filter((a) => !a.startsWith("-"));
  const refspecs = positional.slice(1);
  if (refspecs.some((r) => r.startsWith("+"))) return "Force pushes (a + refspec) are blocked.";
  const targets = refspecs.map((r) =>
    (r.includes(":") ? r.split(":").pop() : r).replace(/^refs\/heads\//, ""),
  );
  if (targets.includes(PROTECTED) || (targets.includes("HEAD") && currentBranch() === PROTECTED))
    return `Pushing to ${PROTECTED} is blocked. Push your branch and let auto-merge land it.`;
  if (refspecs.length === 0 && currentBranch() === PROTECTED)
    return `You're on ${PROTECTED}, so a bare push would target it. Switch to your branch first.`;
  return null;
}

export function problem(command, currentBranch = () => null) {
  for (const words of simpleCommands(command)) {
    if (words[0] === "git") {
      const { sub, args, dir } = gitSubcommand(words);
      const branch = () => currentBranch(dir);
      const flags = shortFlags(args);
      if (sub === "push") {
        const p = pushProblem(args, branch);
        if (p) return p;
      }
      if (sub === "reset" && args.includes("--hard"))
        return "git reset --hard is blocked, as it throws away work. Use git restore on named files, or a new commit.";
      if (sub === "clean" && (flags.includes("f") || args.includes("--force")))
        return "git clean -f is blocked, as it deletes untracked files. Remove named files instead.";
      if (
        sub === "branch" &&
        (flags.includes("D") ||
          (args.includes("--delete") && args.includes("--force")) ||
          (flags.includes("d") && (flags.includes("f") || args.includes("--force"))))
      )
        return "git branch -D is blocked. A failed attempt keeps its branch (Q8).";
    }
    if (words[0] === "gh" && words[1] === "pr" && words[2] === "merge" && !words.includes("--auto"))
      return "gh pr merge is only allowed with --auto, so GitHub merges when the required check passes (ADR-0013).";
  }
  return null;
}

function currentBranchIn(dir) {
  try {
    return execFileSync("git", ["-C", dir ?? ".", "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const command = JSON.parse(input)?.tool_input?.command ?? "";
  const p = problem(command, currentBranchIn);
  if (p) {
    process.stderr.write(`Blocked by the git guardrail (.claude/hooks/git-guardrails.mjs): ${p}\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
