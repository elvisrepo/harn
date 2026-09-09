# Harness decisions — running record of the article review

Decision record for applying ["Harness engineering for coding agent users"](https://martinfowler.com/articles/harness-engineering.html)
(Böckeler) to this repo — **one section per element, added as we review the
article 1 by 1**. Covered so far: **Principles · CfRs · Rules · Ref Docs ·
How-tos · Language Servers (batch + interactive, pi-only) · CLIs, scripts**.

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

---

## How-tos

Procedures: the verified, step-by-step path to accomplish a specific task —
the last ✦ inferential guide. The agent reads the steps and adapts them to the
situation; the best how-tos embed exact commands and expected receipts so
judgment stays minimal. Distinctions: rules say what must/mustn't happen,
ref docs say what is true, how-tos say the ordered steps. In agent terms a
how-to usually *becomes* a skill (the article's example: "Skill with
instructions and a bootstrap script" — rated Both computational and
inferential).

Quality properties: **executable by the agent** (exact commands, expected
outputs, verification per step) and it is the **steering loop's capture
mechanism** — the article: agents can "create how-to guides from codebase
archaeology". Every hard-won one-off debugging session should crystallize into
a how-to, or it decays back into tribal memory.

Decisions (2026-09-04):

1. **Created `docs/Harness how-tos.md`** — five procedures, each with exact
   commands, expected receipts, and the gotchas we earned:
   - *Take a harness snapshot* (/admin or API flow → then `versions:export`)
   - *New-machine setup* (clone → install → `.env` → `db:setup` →
     `versions:import --force` → `check`)
   - *Rotate leaked secrets* — earned 2026-09-03 (`.env` pushed to GitHub):
     untrack (tracked files override `.gitignore`), rotate, wipe admin,
     reseed, verify via browser-qa, history-scrub decision
   - *Regenerate archify diagrams* (typed JSON → validate → deliver; common
     showcase failures listed: label/edge clearance, desktop-readability, the
     MODS/FILES-outside-subgraph cycle)
   - *Run & interpret `npm run check`* — expected receipt + a
     failure-interpretation table (encoding the AUTH_URL-origin, Secure-cookie
     and Accept-header lessons)
2. **Doc index wiring** — AGENTS.md index gained the how-tos line ("read
   before doing any of them").
3. **Snapshot convention extended** — snapshots are explicitly followed by
   `npm run versions:export` (portable history stays current).

---

## Language Servers

The only semantic control that is fully deterministic (⚙ computational guide):
ground-truth code intelligence — exact types, signatures, definitions,
references, live diagnostics. As a feedforward guide it steers the agent
*before* it writes; the same diagnostics run *after* a change are a sensor.
The LSP is the engine — placement decides the role. Article status: *"increased
chatter about the integration of LSPs and code intelligence in coding
agents"* — emerging.

Audit finding (2026-09-04, the interesting one): our `npm run check` ran
`astro build`… which **does not type-check TypeScript** (esbuild strips types
without checking). A type error in `src/lib/*.ts` sailed through build AND
check. The typecheck sensor we thought we had did not exist.

Decisions (2026-09-04):

1. **Batch form adopted: `astro check`** (the TypeScript/Astro language engine
   in CLI mode) chained into `npm run check` (build → typecheck → secrets →
   flows). DevDeps: `@astrojs/check` + `typescript@6` — *gotcha:* TypeScript
   7 (the new native compiler) does not yet expose the programmatic API
   `astro check` needs; it fails until TS 6.x is pinned (per Astro's guidance).
   First run earned its keep immediately: 1 real error (`err` typed `unknown`
   in C4Diagram.astro's catch) — fixed; now **0 errors / 0 warnings** (6
   cosmetic hints, non-gating).
2. **Interactive LSP = open frontier, honestly deferred.** The guide form
   (diagnostics surfaced while editing) needs pi-side integration that does not
   exist today (tools are read/bash/edit/write; no MCP client). The batch
   sensor captures most of the value for a repo this size. `implement`'s
   "typecheck" step now has a concrete command (`npx astro check`).
3. **Secrets-sensor refinement** (same session): env-style pattern now skips
   `<placeholder>` values so the how-to doc's rotation teaching doesn't false-
   positive; the rotation snippet itself made generic (no literal secret-prefix
   in docs).

Decisions (2026-09-09 — interactive landed, then qualified pi-only):

4. **Interactive form adopted: `.pi/extensions/lsp-diagnostics/`** (pi
   extension, LSP client over stdio to `typescript-language-server`):
   `didOpen`/`didChange` sync + `publishDiagnostics` pushes appended as
   `[LSP]` receipts to `edit`/`write`/`bash` tool results (silent when
   clean, ≤2 s wait, severity ≤ 2 capped at 10) + `diagnostics` on-demand
   probe. Bash-diffing also `didClose`s files deleted on disk. Failure
   policy: server won't start → stay silent; batch sensor still covers
   handoff. Protocol review in `docs/LSP — review and integration.md`.
5. **LSP extension is pi-only — recorded explicitly.** It imports
   `@earendil-works/pi-coding-agent` and uses pi's `tool_result` hook +
   `registerTool`: under **opencode it does not execute** (no
   `opencode.json` / `.opencode/` mapping exists). While we run opencode
   keeping pi conventions, the portable language-server cover is the
   **batch sensor** (`astro check` in `npm run check`). Do not claim
   in-loop LSP cover on opencode runs. Open hardening still applies
   (hook throw ≡ silent-clean — needs a distinct `[LSP] diagnostics
   failed` note).

---

## CLIs, scripts

Computational (⚙) feedforward guides: deterministic tooling the agent invokes
*before/during* generation instead of guessing. The article's shape for them
is the hybrid — *"Skill with instructions and a bootstrap script"*, rated
Both computational and inferential — and Fig 3's lifecycle gives the family:
`/xyz-api-docs`-style fact skills feedforward; `npx eslint` / `semgrep` /
`npm run coverage`-style commands as the fast feedback ring.

Decisions (2026-09-09 — reviewed, verified present):

1. **The pattern is skill + script with receipts — keep it.** Inventory
   (verified this session: `firecrawl` CLI v1.12.2 authenticated with
   970/1,000 credits; `archify` validate → deliver; `qa.mjs` with `--json`
   / `--assert` / `--eval`): inferential instructions wrapped around a
   deterministic command that returns machine-readable output, stable exit
   codes, and cost guards (`--limit` caps, scrape top hits only, outputs to
   `.firecrawl/` not the context window). Any new control ships in this
   form.
2. **CLI/script form first — portability rule.** CLIs run through `bash`,
   which exists in both pi and opencode: they are the one guide category
   that survives the harness switch unchanged (unlike the pi-only LSP
   extension above). Prefer encoding a new control as a script over an
   extension. Three placements, all kept: mid-loop via `bash` (facts,
   diagrams, browser evidence), `npm run check` as the left-shifted gate,
   one-shot harness-ops scripts with exact commands + expected receipts
   (see `docs/Harness how-tos.md`).
3. **Known gaps, named not hidden:** (a) `qa.mjs --help` omits real flags
   (`--eval`, `--login`, `--login-expect`) — the article's coherence
   question in miniature; fix the help text. (b) No structural linters
   (Fig 3's `eslint`/`semgrep`/`dep-cruiser` ring) — deliberately deferred
   at this repo size; typecheck + secrets + browser carry the load.
   (c) Firecrawl budget has no sensor — proposal: a warn-only
   `--status` line (never fail) so cost is visible before the skills burn
   it.