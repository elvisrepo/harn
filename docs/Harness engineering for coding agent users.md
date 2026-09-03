# Harness engineering for coding agent users

Condensed review of the martinfowler.com article — the mental model behind user
harnesses for coding agents, and how it maps to this repo's harness.

**Article:** https://martinfowler.com/articles/harness-engineering.html
**Author:** Birgitta Böckeler (Thoughtworks) · published 2026-04-02 (supersedes
her Feb 2026 memo: https://martinfowler.com/articles/exploring-gen-ai/harness-engineering-memo.html)

## Thesis

To trust AI-generated code with less supervision, engineer a **user harness**
around the coding agent — *everything between the model and your codebase*. It
is a cybernetic control system: steer the agent **before** it acts, and catch
mistakes **after** via self-correction, so issues are fixed before they reach
human eyes → less review toil, higher quality, fewer wasted tokens.
*Agent = Model + Harness* (LangChain's wider definition, narrowed here to coding
agents).

## Core concepts

| Concept | Meaning |
|---|---|
| **Guides (feedforward)** | Steer before acting. Inferential: principles, CfRs, rules, reference docs, AGENTS.md, skills. Computational: language servers (LSP), CLIs, scripts, codemods |
| **Sensors (feedback)** | Observe after acting, help self-correct. Inferential: review agents, LLM-as-judge. Computational: static analysis, logs, browser. Best when optimised for LLM consumption — "positive prompt injection" (linter messages that include fix instructions) |
| **Computational vs Inferential** | Deterministic/cheap/reliable (tests, linters, type checks, structural analysis) vs semantic/expensive/non-deterministic (AI review, semantic judgment). Computational: every change. Inferential: rationed |
| **Steering loop** | Human iterates the harness: when an issue recurs, improve controls. Agents can also build the harness (draft rules from patterns, scaffold linters, how-tos from codebase archaeology) |
| **Keep quality left** | Distribute sensors by cost/speed across the lifecycle: before commit → pre-integration self-correction → human review → integration → pipeline (re-run fast + expensive: mutation testing, broad review) → continuous drift/runtime sensors (dead-code scans, SLO monitors, AI judges) |
| **Regulation categories** | Maintainability (easiest — existing tooling; computational = structural, inferential = semantic, neither reliably = misdiagnosis/over-engineering/correctness without a clear spec) · Architecture fitness (fitness functions: perf/docs skills feedforward + perf/observability checks feedback) · **Behaviour** (open problem: spec feedforward + AI-test-suite feedback + manual testing; approved-fixtures pattern helps selectively) |
| **Harnessability / ambient affordances** | Some codebases naturally afford harnesses (strongly typed langs, clear module boundaries, frameworks). Greenfield can bake it in; legacy "needs the harness most where it's hardest to build" |
| **Harness templates** | Per-topology bundles (data dashboard/Node, CRUD/JVM, event processor/Golang): structure + tech stack + guides/sensors, instantiable. Ashby's Law: committing to a topology reduces variety → a comprehensive harness becomes achievable |
| **The human's role** | Developer experience is an implicit harness (accountability, org memory, taste). Harnesses externalise it but only partially — the goal is not zero human input but directing it where it matters most |

**Figures** (read via their alt text — diagram summaries):
1. Bounded contexts — concentric circles: model (core) → builder harness → user harness (outer)
2. Overview — guides feed forward into the agent; feedback sensors point at the agent and its self-correcting loop; a human steers both
3. Change lifecycle — feedforward (LSP, architecture.md, /how-to-test, AGENTS.md, MCP→knowledge mgmt, API-docs skill) → first self-correction (/code-review, eslint, semgrep, coverage, dep-cruiser) → human review → integration → pipeline (re-runs + /architecture-review, /detailed-review, mutation testing) → new commits
4. Continuous feedback — drift detection (/find-dead-code, /code-coverage-quality, dependabot) and runtime feedback (SLOs → agent suggestions, /response-quality-sampling, /log-anomalies)
5. Regulation categories — guides/sensors horizontal; maintainability / architecture fitness / behaviour vertical; behaviour harness: spec guide + test-suite sensor (mixed) + human review/manual tests
6. Harness templates — topology stack (Node dashboard, JVM CRUD, Golang event processor), one expanded into structure + tech stack + instantiable guides/sensors

## Open questions (from the article)

- Keeping a harness coherent as it grows — guides and sensors in sync, not contradicting
- Trusting agents to weigh contradictory instruction/feedback signals
- Silent sensors: high quality or blind detection? Need harness coverage metrics like test coverage/mutation testing
- Tooling to configure, sync, and reason about guides+sensors **as a system** — currently scattered across delivery steps
- Industry examples: OpenAI's harness post (layered architecture + custom linters + "garbage collection" agent suggestions) · Stripe minions (pre-push lint hooks, shift-feedback-left, blueprints)

## How it maps to this repo

| Article concept | Here |
|---|---|
| Inferential feedforward guides | AGENTS.md · `.pi/skills/` (grilling → to-spec → to-tickets → implement) |
| Computational sensors | typecheck/build (fails a change), `browser-qa` (console/DOM/error checks, screenshots), tests at the spec's seam |
| Inferential sensors | archify 9-gate validation with repair receipts (computational but new-style receipts), firecrawl web facts, AI review |
| Keep quality left | pipeline ships specs → tickets → TDD seam tests |
| Missing-tooling ask: reason about controls as a system | **this app** — Harness Mods catalog + `/harness` map + versioned snapshots (v1…v7) + versioned C4 artifacts |

Source: reviewed in-session on 2026-09-03 (article + all figure alt-texts).