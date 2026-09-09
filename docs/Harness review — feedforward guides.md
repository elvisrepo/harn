# Harness review — feedforward guides (Fig 2)

Working notes on the article's central figure
(https://martinfowler.com/articles/harness-engineering.html) — the Guides &
Sensors overview — focusing first on **feedforward / Guides**.

## The two goals of a well-built outer harness

> A well-built outer harness serves two goals: it increases the probability
> that the agent gets it right in the first place, and it provides a feedback
> loop that self-corrects as many issues as possible before they even reach
> human eyes. Ultimately it should reduce the review toil and increase the
> system quality, all with the added benefit of fewer wasted tokens along the
> way.

- **Guides (feedforward controls)** — anticipate the agent's behaviour and aim
  to steer it *before* it acts; increase the probability of a good first
  attempt.
- **Sensors (feedback controls)** — observe *after* the agent acts and help it
  self-correct. Most powerful when their signals are optimised for LLM
  consumption (e.g. custom linter messages that include self-correction
  instructions — "a positive kind of prompt injection").
- Imbalance either way fails: feedback-only → the agent repeats the same
  mistakes; feedforward-only → rules encoded but never verified.

## What the figure shows (read from the image)

Layout: left → the outer **Human** ("Steering", with a cycle icon on each
arrow) steers *both* boxes; middle → the outer harness frame with two stacked
groups; right → the **Coding Agent** with two cycles:
**feedforward → initial generation** (top) and **feedback → self-correcting**
(bottom).

**Guides (top group, feedforward):**

| Guide | Type marker |
|---|---|
| Principles | ✦ inferential (pink diamond) |
| CfRs | ✦ inferential |
| Rules | ✦ inferential |
| Ref Docs | ✦ inferential |
| How-tos | ✦ inferential |
| Language Servers | ⚙ computational (teal gear) |
| CLIs, scripts | ⚙ computational |
| Code mods | ⚙ computational |
| … (open-ended row) | — |

**Sensors (bottom group, feedback):**

| Sensor | Type marker |
|---|---|
| Static analysis | ⚙ computational |
| Review agents | ✦ inferential |
| Logs | ⚙ computational |
| Browser | ⚙ computational |
| … (open-ended row) | — |

Legend: **✦ Inferential** (pink diamond) · **⚙ Computational** (teal gear).

Takeaway from the split: guides skew **inferential** (steering is cheap as
text); sensors skew **computational** (verification wants determinism).

## Feedforward / Guides — our current state

_Verified 2026-09-09. Decisions behind each row live in `docs/Harness decisions.md` — this table is the index, not the record (single-source rule)._

| Guide (article) | Ours | Status |
|---|---|---|
| Principles | 9 stated in AGENTS.md + decisions record + catalog mod | have |
| CfRs | 6 standing bars in AGENTS.md + `to-spec` template slot | have |
| Rules | AGENTS.md + skill-scoped rules + catalog-mirror rule (secrets rule graduated to sensor) | have |
| Ref Docs | `docs/` indexed in AGENTS.md, single-source rule, `current-harness.md` verified at v7 | have |
| How-tos | `docs/Harness how-tos.md` — 5 procedures (snapshot, new-machine, rotate secrets, archify regen, check) | have |
| Language Servers | batch: `astro check` in `npm run check` (portable) + interactive: `.pi/extensions/lsp-diagnostics/` (**pi-only** — inert under opencode) | have (portable batch; pi-only interactive) |
| CLIs, scripts | firecrawl, archify CLI, browser-qa qa.mjs, npm scripts | have |
| Code mods | none | gap (low priority here) |

Former top gaps (How-tos, Principles) closed 2026-09-03/04. Remaining
feedforward gap: **Code mods** (deliberately deferred — low leverage here).
**Runtime note (2026-09-09):** we run **opencode** while keeping the pi
harness conventions. The LSP extension is **pi-only** (needs pi's
ExtensionAPI: `tool_result` hook + `registerTool`) — under opencode it does
not execute; the portable language-server cover is the batch sensor
(`npx astro check` inside `npm run check`).