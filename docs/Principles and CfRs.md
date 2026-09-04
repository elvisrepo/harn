# Principles & CfRs — decision record

The two standing guide sets for this project. The agent-visible copies live in
`AGENTS.md` (read every turn); this doc is the **decision record** — what we
chose, why, and which incidents earned each item.

Decided 2026-09. Sources: Harness Mods work sessions ·
["Harness engineering for coding agent users"](https://martinfowler.com/articles/harness-engineering.html)
(our review: `docs/Harness review — feedforward guides.md`).

---

## Principles

Values the agent applies **with judgment** — the top of the inferential Guides
stack; they outrank other guidance when rules conflict or a situation is
ambiguous.

| # | Principle | The value / why we chose it |
|---|---|---|
| 1 | **Minimalism** | Only the code the immediate problem needs; no speculative features, abstractions, or predictive configs. Keeps diffs reviewable and the harness small |
| 2 | **Surgical edits** | Touch only the lines the task requires; leave adjacent code untouched. Protects review toil and blame-free diffs |
| 3 | **Goal-driven** | Break tasks into steps with explicit success criteria; verify before claiming done |
| 4 | **Clarify, don't guess** | State assumptions; halt on ambiguity. Guesses compound into rework |
| 5 | **Receipts over prose** | Sensors/checks report stable, machine-readable facts — feed evidence back, not guesses (archify diagnostics, browser-qa JSON) |
| 6 | **Sensors before handoff** | Run `npm run check` (build + behaviour flows) before declaring work done — keep quality left |
| 7 | **Snapshots are point-in-time truth** | Diffs must never mislead; never silently rewrite history. *Earned:* the v5/v6 context-drop confusion (context ≈61.9k → ≈2.7k was session-length measurement, not a regression) |
| 8 | **Secrets only via env** | Never logged, echoed, or committed. *Earned:* the preview auth debugging (403s) where credentials surfaced in env |
| 9 | **Fix the kit first** | Recurring issues get fixed in skills/conventions/checks, not just the instance — the article's steering loop. *Earned:* the diff-display confusion fixed once in code + twice in docs |

---

## Cross-functional requirements (CfRs)

Standing quality bars — **how the system performs**, not what it does. Applied
with judgment as guides; translated into **testable acceptance criteria** where
possible (then they graduate to computational sensors: `npm run check` +
browser-qa already verify build/behaviour/usability on every run).

| # | CfR | Acceptance shape | Earned / rationale |
|---|---|---|---|
| 1 | **Security** | Secrets only via env — never logged, echoed, or committed; session cookies httpOnly; origin checks enforced | better-auth + origin-check work; preview 403 debugging |
| 2 | **Data integrity** | Snapshots are point-in-time truth; no silent history rewrites; seeding/migrations idempotent | snapshot v5 refresh; `db:seed` idempotency |
| 3 | **Environment portability** | Behaviour identical across dev / preview / production (watch `AUTH_URL`, `NODE_ENV`-dependent cookie flags); verify in real conditions, not just dev | *Earned:* preview login 403 — better-auth rejected the origin when `AUTH_URL` ≠ serve origin; Secure cookies dropped over http |
| 4 | **Real-browser usability** | Served URLs must work in actual browsers (content negotiation, cookies), not only via curl or scripted clients | *Earned:* `/docs/archify/…` 404 — curl `*/*` got 200, browsers (`Accept: text/html`) got Astro's 404; fixed by static `public/` serving |
| 5 | **Maintainability** | Typed artifacts, machine-readable receipts, kit-vs-instance separation (see `docs/Harness reuse contract.md`) | article's "reason about controls as a system" |
| 6 | **Performance / scalability** | Explicitly loose — local single-user tool; do not over-engineer | minimalism applied to CfRs themselves |

Per-feature: `to-spec` captures the applicable subset as testable acceptance
criteria (template section `## CfRs`), or "None beyond the repo defaults".

---

## Disambiguation (recorded so we don't re-research)

"CfR" is ambiguous in the wild. Our meaning: **Cross-Functional Requirements**
(formerly NFRs). Not: *Change Failure Rate* (a DORA **metric** — that would be
a sensor, not a guide) and not *21 CFR Part 11* (FDA compliance). References:
[Kua — three ways to handle CfRs](https://thekua.com/atwork/2017/05/three-ways-to-handle-cfrs/) ·
[GovStack CFR architecture](https://govstack.gitbook.io/cfr-architecture/6-cross-functional-requirements).