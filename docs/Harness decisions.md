# Harness decisions — running record of the article review

Decision record for applying ["Harness engineering for coding agent users"](https://martinfowler.com/articles/harness-engineering.html)
(Böckeler) to this repo — **one section per element, added as we review the
article 1 by 1**. Covered so far: **Principles · CfRs · Ref Docs · Rules**.

The agent-visible copies live in `AGENTS.md` (read every turn); this doc holds
the decisions, the reasoning, and the incidents that earned them. Companion
docs: `docs/current-harness.md` (how the harness works) ·
`docs/Harness reuse contract.md` (kit vs instance + glossary) ·
`docs/Harness review — feedforward guides.md` (fig 2 notes).

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

Decision (2026-09): extracted from AGENTS.md's instruction paragraph — they
existed implicitly, unlabeled and mixed with mundane rules — into a labeled
block at the top of AGENTS.md, plus a catalog mod.

---

## Cross-functional requirements (CfRs)

Standing quality bars — **how the system performs**, not what it does. Applied
with judgment as guides; translated into **testable acceptance criteria** where
possible (then they graduate to computational sensors: `npm run check` +
browser-qa already verify build/behaviour/usability on every run).

| # | CfR | Acceptance shape | Earned / rationale |
|---|---|---|---|
| 1 | **Security** | Secrets only via env — never logged, echoed, or committed; session cookies httpOnly; origin checks enforced. **Enforced** by the secrets scan in `npm run check` (fails with file:line, never echoes the value). *Earned twice:* the preview 403 debugging, and the 2026-09-03 incident where `.env` (AUTH_SECRET + ADMIN_PASSWORD) was tracked and pushed to GitHub — caught by the secrets sensor on its first run; secrets rotated, file untracked | better-auth + origin-check work; preview 403 debugging |
| 2 | **Data integrity** | Snapshots are point-in-time truth; no silent history rewrites; seeding/migrations idempotent | snapshot v5 refresh; `db:seed` idempotency |
| 3 | **Environment portability** | Behaviour identical across dev / preview / production (watch `AUTH_URL`, `NODE_ENV`-dependent cookie flags); verify in real conditions, not just dev | *Earned:* preview login 403 — better-auth rejected the origin when `AUTH_URL` ≠ serve origin; Secure cookies dropped over http |
| 4 | **Real-browser usability** | Served URLs must work in actual browsers (content negotiation, cookies), not only via curl or scripted clients | *Earned:* `/docs/archify/…` 404 — curl `*/*` got 200, browsers (`Accept: text/html`) got Astro's 404; fixed by static `public/` serving |
| 5 | **Maintainability** | Typed artifacts, machine-readable receipts, kit-vs-instance separation (see `docs/Harness reuse contract.md`) | article's "reason about controls as a system" |
| 6 | **Performance / scalability** | Explicitly loose — local single-user tool; do not over-engineer | minimalism applied to CfRs themselves |

Per-feature: `to-spec` captures the applicable subset as testable acceptance
criteria (template section `## CfRs`), or "None beyond the repo defaults".
Decision (2026-09): CfRs block added to AGENTS.md + catalog mod + the
`to-spec` template slot.

---

## Rules

Precise, directive constraints — "always / never / must" statements scoped to a
context. In Fig 2 they sit in Guides (✦ inferential): still text the LLM
interprets — nothing mechanical enforces them. The key dynamic of the taxonomy:
**a rule that can be mechanically checked should graduate into a computational
sensor** whose failure message carries the fix ("positive prompt injection").
Standing failure mode (article): rules without sensors = an agent that "encodes
rules but never finds out whether they worked."

Distinctions: Principles are judgment tiebreakers; CfRs are system quality
bars; How-tos are procedures. A CfR translated into a testable acceptance
criterion becomes a rule + a check.

Decisions (2026-09-03):

1. **Catalog-mirror rule** → AGENTS.md Conventions: *"any mod edit made through
   the `/admin` UI must be mirrored into `scripts/seed.ts`, or the next
   `db:seed` reverts it."* *Earned:* the rule was real (the DB reverts UI
   edits) but lived only in chat — the invisible-rule failure.
2. **Secrets rule graduated into a sensor** — "secrets never committed"
   (Principle 8 / CfR 1) is now **enforced** by `scripts/check-secrets.mjs` in
   `npm run check`: scans git-tracked files for 6 credential patterns, reports
   file:line + pattern name without echoing the value. *Its first run caught a
   live incident:* `.env` (AUTH_SECRET + ADMIN_PASSWORD) was tracked and pushed
   to GitHub — remediated (untracked, rotated, admin recreated, login verified).
3. **Skill-scoped rules stay put** — no central extraction. Inventory (real
   quotes): `to-spec` ("Do NOT interview the user", "do not invent decisions",
   "Do not commit — implementation owns commits"), `implement` ("stop and tell
   the user — do not silently expand the slice"; unblocked-tickets-only),
   `grilling` ("Never ask the user for anything you could look up"),
   `browser-qa` ("never hardcode secrets"), firecrawl (cost rules: `--limit`
   ≤ 10, scrape only the top 1–2 hits). Placement follows the article: rules
   live near what they govern; only repo-wide rules belong in AGENTS.md.

---

## Ref Docs

Facts to consult, not instructions — the "what is true about this system"
layer. Inferential (the agent must decide to look and interpret);
progressive disclosure (zero tokens until needed). Quality = **discoverable
AND current**; failure modes: a stale doc is worse than none (the agent trusts
it), an invisible doc never helps.

Decisions (2026-09-03):

1. **Doc index in AGENTS.md** — five docs with when-to-read purpose; the agent
   sees the index every turn.
2. **`current-harness.md` refreshed to v7** — it sat at v3-era ("5 skills",
   ≈40k context) while AGENTS.md said 15: two ref docs disagreeing is exactly
   the article's incoherence failure. Now stamped *"Verified at snapshot v7"*.
3. **Single-source rule** — ref docs link to systems of record (`/harness`,
   snapshots); they do not copy drifting facts. Stated in AGENTS.md.
4. **Glossary** — added to the reuse contract (Kit/Instance, Guide, Sensor,
   CfR, Receipt, Steering loop, `check`, Snapshot/C4 artifact, Mod,
   Single-source rule).