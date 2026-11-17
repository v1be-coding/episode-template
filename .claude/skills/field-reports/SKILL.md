---
name: "field-reports"
description: "Research how a library, tool, API or dev technique works in real use (bugs, workarounds, what actually helps) via issues, forums and Reddit plus official sources, keeping both tiers separate."
---

# Field Reports

Official sources say what *should* work. Field reports say what *does*. Keep them apart: never let a forum post stand in for a documented fact, and never let official guidance silently overrule a pattern of user reports.

For pure "what does the API do" questions, use `/research` instead.

## Workflow

1. **Classify the question.**
   - **Library:** a specific package, tool, or API. Extract name, version, and goal or exact error text.
   - **Practice:** a technique or approach (prompting, testing strategy, architecture). Extract the goal and the context it applies to (model, stack, scale).
2. **Check the repo first.** Grep project docs and notes for the topic; they may already answer it.
3. **Spawn 3–6 agents in parallel** (Agent/Task tool, in the background):

   | Agent | Searches | When |
   |---|---|---|
   | Docs baseline | official docs, changelog, migration guide | library |
   | Guidance & research | vendor guides, provider docs, papers, published evals | practice |
   | Issues | GitHub issues and discussions on the relevant repo | a specific repo exists |
   | Error | exact error string, quoted | error given |
   | StackOverflow | Q&A | how-to, error |
   | Community | Reddit, HN, dev forums | always |
   | Blogs | write-ups by named authors on real projects | migration, comparison, practice |

   Each agent returns, per source: URL, date, what it concerns (version, or model/tool), source type, one-line claim.
4. **Score each source** (see Scoring).
5. **Cluster community claims.** Group reports of the same behavior or result. Count *independent* reporters — different people, not reposts or replies in one thread.
6. **Write the report** (see Output) to one Markdown file where the repo keeps notes; if there is no convention, pick a sensible spot and say where. Give the user a 3–5 line summary in chat.

## Scoring

**Authority**
- High: official docs, changelogs, maintainer replies, vendor/provider guides, peer-reviewed papers or published evals with methodology
- Medium: issue reports with repro, accepted or high-vote SO answers, blogs by named authors on real projects, high-engagement Reddit/HN threads where people show their setup or results
- Low: low-vote answers, vague claims, unattributed blogs
- Discard: no specifics and reads as SEO or AI filler, vendor-sponsored comparisons, listicles that only restate official guidance

**Specificity** (community sources) — raise one level for each of: exact version or model, error output or before/after results, repro steps or code/prompts, stated setup (OS, framework, scale). Specifics beat upvotes.

**Recency** — weigh by how fast the subject moves. Advice about AI models goes stale within months; a fast-moving framework within a year or two; a stable library's older threads may still hold. An older maintainer comment can outweigh a newer popular post.

**Relevance** — Library: same version and goal is high; different major version is low unless the report says it still applies. Practice: same model/tool class and similar context is high; results from much older models or unrelated stacks are low.

## Confidence for community findings

- **Strong pattern:** 3+ independent, specific, recent reporters
- **Emerging:** 2 reporters, or 1 backed by a maintainer or published eval
- **Anecdote:** 1 report — include only if specific and important, and label it

## Output

```markdown
# <Question>
_<subject + version or model> · researched <date>_

## TL;DR
<3–5 lines: answer, biggest gotcha, recommended path>

## Documented / recommended
- <claim> — [source](url)

## Field reports
### <Behavior or result> — Strong pattern (5 reporters)
<what people hit or found, under what conditions, workaround if any>
Sources: [issue #123](url), [SO](url), [reddit](url)

## Official vs reality
- Official sources say <X>; users report <Y> when <conditions>. Status: <open issue / fixed in vN / undocumented / contested>

## Workarounds / what works
- <approach> — confirmed by <n> reporters; [source](url)

## Gaps
- <what couldn't be confirmed>
```

Omit empty sections. Never resolve an official-vs-reality conflict by picking a winner — report both.

## Gotchas

- Complaints are overrepresented; happy users rarely post. Say so when the picture looks lopsided.
- Before calling a reported bug current, look for a closing commit or changelog entry that fixed it.
- Docs aggregators (e.g. Context7) can lag a new major release — confirm which version they document.
- For practice questions, "it worked for me" without results is weak; prefer reports with before/after comparisons.