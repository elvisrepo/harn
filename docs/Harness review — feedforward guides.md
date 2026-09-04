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

| Guide (article) | Ours | Status |
|---|---|---|
| Principles | implied inside AGENTS.md, but never stated as *principles* | thin |
| CfRs (rules for contributing) | AGENTS.md covers a slice | partial |
| Rules | AGENTS.md + skill instructions | have (informal) |
| Ref Docs | `docs/` (current-harness, reuse contract, article summary) — agent-readable but not *curated for the agent* | partial |
| How-tos | none as standalone skills/docs (how-to-test, how-to-add-a-mod…) | **gap** |
| Language Servers | none wired into pi | **gap** |
| CLIs, scripts | firecrawl, archify CLI, browser-qa qa.mjs, npm scripts | have |
| Code mods | none | gap (low priority here) |

Highest-leverage guide gaps for us: **How-tos** (cheap — e.g. "how to add a
mod", "how to run/interpret `npm run check`", "how to take a snapshot") and
**Principles** (a short stated set in AGENTS.md so steering is explicit, not
tribal).