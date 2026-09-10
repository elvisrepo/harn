# Harness decisions — running record of the article review

Decision record for applying ["Harness engineering for coding agent users"](https://martinfowler.com/articles/harness-engineering.html)
(Böckeler) to this repo — **one section per element, added as we review the
article 1 by 1**. Covered so far: **Principles · CfRs · Rules · Ref Docs ·
How-tos · Language Servers (batch + interactive, pi-only) · CLIs, scripts · Code mods · Static analysis (sensors I) · Review agents (sensors II) · Logs (sensors III) · Browser (sensors IV) · Architecture doc (fig 3) · How-to-test (fig 3) · MCP knowledge (fig 3) · Pipeline (CI)**.

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

---

## Code mods

Computational (⚙) feedforward, Fig 2's last guide row — the article's
example: *"a tool with access to OpenRewrite recipes."* Deterministic
program transformations (AST rewrites, migration recipes, scaffolders)
that put code in the desired shape without LLM judgment: the agent says
"apply recipe X" instead of hand-editing dozens of files probabilistically.
Sibling to CLIs/scripts, but it *writes code precisely* where they fetch
facts or check results.

Decisions (2026-09-09 — reviewed, deliberately deferred):

1. **No codemod tooling adopted — verified gap, not neglect.** Grep over
   the repo finds only the word "codemods" in the article-summary doc; no
   jscodeshift / recast / OpenRewrite / scaffolders, no local transform
   scripts. Rationale: ~30-file single-user tool; every candidate change
   is rare and reads better as a reviewed hand-edit (Minimalism; CfR 6
   explicitly forbids over-engineering here).
2. **A trigger rule instead of tooling.** The third occurrence of the same
   mechanical multi-file edit gets encoded as a script — which then ships
   in skill + script form per the CLIs decision. Named candidates, should
   they ever hurt enough: seed-mirror generation (the catalog-mirror rule
   currently runs on discipline), repetitive Astro/API-route scaffolding,
   the TS 6→7 pin flip when Astro supports it.
3. **Catalog mod added** so the feedforward set reads complete and the
   deferral is visible, not tribal.

---

## Static analysis (Sensors I)

Computational (⚙) feedback, Fig 2's first sensor row — deterministic,
millisecond-to-second checks on every change so the agent self-corrects
before human eyes. Fig 3's fast ring: `npx eslint`, `semgrep`,
`npm run coverage`, `npm run dep-cruiser`. The quality bar she sets:
signals *optimised for LLM consumption* — "custom linter messages that
include self-correction instructions."

Decisions (2026-09-09 — reviewed, have with one queued hole):

1. **Have (3 layers, all in `check`):** `astro build` (compile gate) +
   `astro check` under `astro/tsconfigs/strict` (0 errors / 0 warnings /
   6 non-gating hints) + `check-secrets.mjs` (6 patterns over
   git-tracked files; `file:line` + pattern + fix, value never printed).
   The secrets scanner is her "positive prompt injection" verbatim — a
   rule graduated into a sensor — and it caught a live `.env` push on its
   first run. Textbook steering-loop closure.
2. **Style/structural lint deferred-by-rule, not by neglect.** Install on
   the *second occurrence* of a lint-catchable defect. Rationale: the
   steering loop earns controls through recurrence, and our whole
   incident record (type error, secret leak, origin/cookie, Accept
   header) would have sailed past `eslint`/`semgrep` untouched; strict
   `tsc` already covers the high-signal half (unused locals, implicit
   any). A linter with no earned failure fires trivia, and trivia trains
   the agent to discount sensors.
   **Overturned same session (explicit user call):** installed anyway —
   `eslint` (flat config, recommended minus tsc-covered noise rules) +
   `semgrep` with 2 earned rules (no absolute-local `fetch`, no
   `eval`), both green on day one and both wired into `check`. The
   deferral rationale above stands as the bar for *future* lint rules:
   new rules must encode an earned bar, not generic hygiene.
3. **Queued (post-Sensors-review build task):** a thin runnable suite
   mirroring the 4 qa-flows, so `check` verifies behaviour
   computationally instead of only in a browser. The
   coverage-percentage game is explicitly *not* queued — the suite
   proves the seams, not a number.
4. **Implemented same session (`test/`, 9 tests, zero deps).**
   `node:test` + global fetch mirror the 4 flows (catalog coherence incl.
   seed-wiring pins; harness contiguity 1..N + snapshot soundness;
   archify under both Accept headers; login incl. sign-out cleanup, env-
   gated). Same server conventions as qa-flows (`APP_URL` or self-booted
   preview) — and writing it caught a real kit bug: `astro preview`
   daemonizes, so spawner-kill leaked the server (stale 54321); both the
   suite helper and qa-flows now reap via `preview stop`.
5. **Coverage investigated, not adopted — negative result with receipts.**
   Black-box HTTP coverage must come from the *server* process, but:
   `astro preview` daemonizes (measured env never reaches the worker —
   raw V8 data held 2,311 hit functions, zero under `/dist/server/`);
   direct `node dist/server/entry.mjs` wrote no coverage files at all;
   and c8 remapped Astro's rolldown bundles to `src/**` at 0% despite
   real traffic. Cheap V8+c8 cannot see this server. Speculative
   machinery (sourcemap flag, c8 dep, runner script) was reverted, not
   kept as shelfware. Revisit triggers: suite growth past ~30 tests, a
   bug slipping a tested seam, or upstream Astro/Vite coverage support.
   The suite remains the behavioural gate — it proves the seams.
6. **Unit coverage adopted for the pure lib core (same session).**
   Correction to the blanket "unmeasurable": `c4`/`mods`/`context`
   export pure functions that run in-process — `test/lib.test.mjs`
   (13 tests: slugify cases, toView fallbacks, token math, highlight
   dimensions, graph shape + the mermaid-bracket regression + step
   contiguity) reports real per-file lines (c4 ~90%, mods ~90%,
   context ~35% — `measureContext` needs fs fakes, openly uncovered).
   `npm run coverage` uses the built-in flag (zero deps); thresholds
   stay off until earned — the uncovered-lines list is feedback for the
   next test session, not a gate.

---

## Review agents (Sensors II)

Inferential (✦) feedback, Fig 2's second sensor row — semantic judgment
after the act for what deterministic checks cannot see (misdiagnosis,
over-engineering, wrong slice, spec mismatch). Fig 3 rations it by cost:
`/code-review` in the first self-correction loop (cheap, every change),
`/architecture-review` + `/detailed-review` post-integration (expensive,
rare). Her examples: OpenAI's "garbage collection" drift-scanners,
Stripe's heuristic-triggered hooks, the "janitor army." Her warnings:
non-deterministic and pricey — ration it — and contradictory signals need
a tiebreaker (that is what Principles are for).

Decisions (2026-09-09 — reviewed, thin, now ritualized):

1. **Status was one unritualized line** — `implement` step 6, "read it as
   a reviewer would": same model, same window, no checklist, no evidence
   required. Earned evidence it was insufficient: the `[LSP]`
   mermaid-bracket bug sailed through it and was caught by a
   computational sensor instead.
2. **Formalized, not expanded** — step 6 is now a 5-point read-back
   checklist (minimalism · scope · CfRs · catalog mirror · receipts),
   same cost as before, actual teeth. No second model, no new skill: a
   ritualized same-model review beats an unritualized line, and nothing
   in our incident record justifies pricier review yet.
3. **Deferred with triggers:** second-model spot review on risky diffs
   (auth, migrations, map) after the next semantic slip past the
   checklist; janitor/GC agents — no, nothing here drifts at army scale.

---

## Logs (Sensors III)

Computational (⚙) feedback, Fig 2's third sensor row — runtime output
observed after the act — plus her Fig-4 continuous form (`/log-anomalies`
judges, SLO monitors) and the fitness variant (logging standards as
guide + debugging against the logs available).

Decisions (2026-09-10 — reviewed, recognized + cleaned, continuous out):

1. **The sensor already exists per-run:** browser-qa captures console
   errors/warnings, page errors, and failed requests on every `check`
   run, gated with the rest. That per-run console capture *is* our logs
   sensor — no new infrastructure, just the name on what we do.
2. **Server logs stay informal by decision.** Process stdout (terminal,
   `/tmp` when backgrounded) with machine-readable one-line receipts in
   scripts. No structured logging, no viewer: single-user local scale
   owes none, and our debugging history never once needed more.
3. **Hygiene (same accident class as `.env`):** `dev.log` + `prod.log`
   (stale, Sep 2) were git-tracked though nobody reads them — untracked
   (`git rm --cached`, files kept) and `*.log` ignored. Tracked files
   override gitignore; local process output is never committed.
4. **Continuous log-anomaly explicitly out of scope:** no runtime users,
   no SLOs — a `/log-anomalies` judge here would be theater. Revisit if
   this ever serves anyone but us.

---

## Browser (Sensors IV)

Computational (⚙) feedback, Fig 2's last sensor row — the app observed
as a user sees it: rendering, navigation, auth cookies, console health.
The backstop of our Real-browser-usability CfR, which exists because
scripted clients lie (curl said 200, browsers got 404). Our strongest
sensor: headless Playwright + system Chrome (error capture, DOM
assertions, `--eval` escape hatch, `--login` flow, screenshots),
4 flows gated in `check`, two real incidents caught that nothing else
could see (archify Accept-header 404, preview login 403).

Decisions (2026-09-10 — reviewed, have, two micro-fixes + one note):

1. **Closed CLIs gap (a):** `qa.mjs --help` omitted real flags — the
   header comment documented them, only the usage-error line was stale.
   Fixed to list every flag; help text and behaviour agree again.
2. **Screenshot hygiene:** every `check` run rewrote the tracked
   `check-*.png` files, dirtying the tree with noise. Untracked
   (`check-*` ignored); curated `qa-*` evidence stays committed. Signal
   up, noise down.
3. **Opencode-era upgrade, free:** under pi + text-only models the
   screenshots were attached but unseen. Under opencode with a
   vision-capable model the agent can actually look at them — same
   sensor, strictly stronger reader. Remember this before adding any
   new visual-verification machinery.

---

## Architecture doc (Fig 3 feedforward)

The change-lifecycle figure feeds `architecture.md` into initial
generation: a curated map of the system *under work*. Split deliberately
from `docs/current-harness.md`, which describes the harness *around* the
agent — the article's two different things, and conflating them is how
the AGENTS.md arch map rotted.

Decisions (2026-09-10 — reviewed, created):

1. **New root-level `architecture.md`** — routes table (file, auth,
   notes incl. the Astro-7 destructured-exports gotcha), middleware
   pipeline, DB schema with the catalog-is-code rule, snapshot/C4 flow,
   the Accept-header static-serving lesson marked do-not-regress, client
   JS + tokens, and where each seam is proven. Structure only, no
   drifting numbers (single-source rule).
2. **The audit that earned it** — AGENTS.md map was missing 10 entries
   (tests, lint, semgrep, extension, 4 scripts, data artifacts), said "5
   skills" for 6, mislabeled `browser-qa` invocation, and
   current-harness.md sat stamped v7 in a v12 world: the coherence
   failure, live. Fixed in the same pass; both docs current at v12+.
3. **Indexed first in the AGENTS.md ref-docs list** ("read before
   changing any route/table/flow") + catalog mod, snapshot v14. One
   buddy, discoverable where the agent looks every turn.

---

## How-to-test (Fig 3 feedforward)

The testing counterpart of the bootstrap skill: instructions telling the
agent *how this repo tests* before it writes — seams, commands, what
green looks like, how to read a failure. Same "Both" hybrid as
bootstrap: inferential steps around deterministic commands.

Decisions (2026-09-10 — reviewed, have, two nits fixed):

1. **Complete in three layers:** doc (`Harness how-tos.md` §5 — exact
   commands, expected receipts, per-step failure table) + executable
   (`test/`, 22 tests inside `check`) + norm (AGENTS.md Testing section,
   `implement` TDD steps, checklist receipts line). Doc, executable, and
   norm agree — rare enough to state.
2. **Nits fixed in the pass:** `implement` step 4 named "the full test
   suite" without naming it — now `npm run check` (with the mid-loop
   commands spelled out); the §5 failure table had no test-failure row —
   a failing seam test sent the reader nowhere. Both one-liners, done.

---

## MCP knowledge (Fig 3 feedforward)

The figure's knowledge-management entry: the agent querying team
knowledge at generation time through a protocol instead of relying on
what is already in context.

Decisions (2026-09-10 — reviewed, gap that mostly isn't):

1. **The knowledge exists; the protocol doesn't.** pi has no MCP
   client (why everything here is files + CLI skills); opencode does
   (verified: `opencode.json` → `mcp`, local + remote, tools
   auto-available) — but this repo has no `opencode.json`, so zero
   servers configured. Meanwhile the knowledge itself (indexed docs,
   decision journal, 29-mod catalog, 14 snapshots) is the most complete
   thing here.
2. **Files win on cost — the docs say so verbatim.** Opencode's own MCP
   page warns servers "add to your context… be careful which ones you
   enable." An MCP filesystem/sqlite server would charge tokens every
   turn for what `read` + grep give at zero cost until needed
   (progressive disclosure already does the rationing).
3. **Split by where knowledge lives:** in-repo → files, no MCP
   warranted. Off-repo (Astro/better-auth API docs) → firecrawl skills
   cover it today via CLI; a Context7-style remote is the convenience
   upgrade. Trigger: first repeated off-repo lookup firecrawl handles
   clumsily, or knowledge spanning repos. One stanza away when earned.

---

## Pipeline (CI)

Fig 3's bottom half: re-run the fast controls after integration, plus
the expensive ones. There was no integration event here (single branch,
single dev), so no pipeline existed — the same `check` served both
halves by discipline alone.

Decisions (2026-09-10 — built, minimal):

1. **One workflow, the whole gate:** `.github/workflows/check.yml`
   runs `npm run check` on push to master + PRs (checkout → node 22 →
   `npm ci` → semgrep via pip → `db:push` → `db:seed` → `check`).
   Chrome ships on the runner; `AUTH_URL` is set by the boot logic
   itself. Secrets (`AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`)
   are test-only creds for the ephemeral CI database, read from
   `secrets.*`, never logged.
2. **Assumptions to watch on first green run:** `drizzle-kit push` is
   non-interactive on a fresh DB (prompts only on destructive changes);
   runner Chrome lives at `/usr/bin/google-chrome` (qa.mjs default).
   First breakage found immediately: `db:seed` loads `--env-file=.env`,
   which is gitignored — the workflow materializes it from secrets
   before seeding. If either assumption breaks, the run fails loudly —
   fix the workflow, not the app.
3. **Still parked behind CI existing:** architecture/detailed review,
   mutation testing. The pipeline now exists to host them when earned.