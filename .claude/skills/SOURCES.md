# Third-party skills

Copied from [mattpocock/skills](https://github.com/mattpocock/skills) at commit
`4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`, unedited, under its MIT licence in
[LICENSE](./LICENSE). `pr` also keeps its own [CREDITS.md](./pr/CREDITS.md).

They're pinned on purpose, so every episode runs the same skills and episodes can
be compared (Q36). Nothing updates them automatically. To update, read the new
upstream versions, copy them over, and change the commit above in the same PR.

Each file's git blob hash matched upstream's at that commit when copied, so
`git hash-object` against upstream's tree shows any local edit.

| Skill                                   | Used for                                    |
| --------------------------------------- | ------------------------------------------- |
| `grill-with-docs`, `grilling`           | Spec phase: the interview                   |
| `domain-modeling`                       | `GLOSSARY.md` and ADRs                      |
| `to-spec`, `to-tickets`                 | Spec phase: the spec issue and its tickets  |
| `implement-spec`                        | Followed by `/attempt`                      |
| `tdd`                                   | Each ticket, through `implement-spec`       |
| `code-review`                           | After all tickets, through `implement-spec` |
| `retro`                                 | After the episode                           |
| `research`                              | Spec phase, for documented facts            |
| `wizard`                                | Steps only the user can do                  |
| `pr`                                    | PR descriptions                             |
| `diagnosing-bugs`                       | Hard failures                               |
| `codebase-design`, `writing-for-agents` | Used by other skills                        |

`field-reports` is from Anthropic's built-in Claude Code skills, copied unedited on
2026-11-16 (git blob `170f5400a699e7475b35f2715658df03cedfa420`). It's pinned the
same way. Use it in the spec phase to learn how a library or technique behaves in
real use: bugs, workarounds, what helps. Use `research` for documented facts.

`/attempt` and `/acceptance` are this repo's own, in `.claude/commands/`.
