# Modularity review — harn (2026-09-15)

First run through the adapted Balanced-Coupling skills
(`.pi/skills/modularity/`): evidence from `scripts/coupling.mjs`
(hotspots/cycles/impact quoted below) + dep-cruiser (50 modules,
85 deps, 0 violations), scope entire codebase, two interview rounds.
No second run yet — schedule one before acting on anything below.

## Context

23 ts/js files: Astro routes/APIs → `src/lib` → `db` (SQLite);
`scripts/` ops + sensors; `test/`; pi-only LSP extension. Single human +
agent, local-only, staying local. Domain classes (accepted):
core = catalog + snapshot/versioning; supporting = map/auth;
generic = plumbing. No known pain points; nothing strategically shifting.

## Executive summary

- Posture: **balanced, boring in the good way.** Zero cycles, enforced
  layering, max fan-in 6 in a 23-file tree.
- Top systemic note, not issue: the two hubs (`db/client.ts`,
  `src/lib/mods.ts`) sit in every blast radius — review priority, not redesign.
- Two latent findings (both tolerable, both with triggers): snapshot-diff
  logic in two places; the seed-mirror rule running on discipline.

## Findings from the tool

- Fan-in: `db/client.ts` (6), `src/lib/mods.ts` (6), `src/lib/auth.ts` (5),
  `boot-preview.mjs`/`c4`/`context`/`harness` (4). Fan-out: `seed.ts` (6),
  `test/lib.test.mjs` (6) — both consumers by job description.
- Cycles: none. Dep-cruiser: 0 violations. 15 zero-fan-in files, all
  entry points by construction (CLI scripts, tests, pages, middleware,
  browser client).

## Interpretation (modularity lens)

| Integration | Strength | Distance | Volatility | Verdict |
|---|---|---|---|---|
| routes → lib | model/functional | low (same repo, one human) | mixed | balanced |
| lib → db | model (schema types) | low | low (schema stable) | balanced |
| scripts/test → lib | functional/contract | low | low | balanced |
| extension ↔ server | contract (LSP URIs/positions) | high (separate process) | low | balanced *by design* — the protocol's whole point |
| UI edits → seed.ts | implicit (mirror rule) | low | **high** (catalog churns) | tolerable while human-gated — trigger below |
| snapshot shape → c4 + page diff | model, ×2 implementations | low | medium | tolerable duplication, trigger below |
| API route pairs | model (CRUD shapes) | low | low | tolerable; third endpoint triggers |

Distance is uniformly low (one human, one repo, sync) — so nearly any
strength balances. The only high-distance pair is the LSP extension,
and it survives on contract-level strength. Volatility concentrates in
*catalog content*, which isn't code coupling at all.

## Deep dives

**1. Snapshot-diff logic in two places.**
`c4HlLabels` (`src/lib/c4.ts`) and `diffSnapshot` (`src/pages/harness.astro`)
implement the same dimension-diff deliberately mirrored (comment says so).
Why it hurts (mildly): a new snapshot dimension needs both updated or map
highlight and panel disagree — the coherence failure in miniature.
Options: (a) leave it — 6 dimensions, changes yearly; (b) single source
(diff in lib, page imports the labels). Better is (b) *if* touched again;
today it's a note. Trigger: next snapshot-shape change does (b).

**2. Seed-mirror rule on discipline.**
Every `/admin` catalog edit must be mirrored into `scripts/seed.ts` or
`db:seed` reverts it — implicit coupling between runtime DB writes and a
source file, in the highest-volatility area (catalog content churns
constantly), held together by a human remembering. Why it hasn't hurt:
single author, checklist line. Trigger: first mirror-miss (UI edit lost
to reseed) → automate (seed-mirror generator or DB→seed exporter, per
the codemod rule's named candidate).

**3. API route duplication (watch, don't touch).**
`api/mods.ts` vs `api/harness-versions.ts`: same session-check preamble,
same CRUD shapes. Two instances don't earn an abstraction — third one
does, per the codemod rule. Noted so the third endpoint doesn't become
the fourth copy-paste.

## Future change risk

- New sensor in `check`: one chain string + one how-tos row (proven 4× this month).
- New page: one `.astro` + lib reuse (8 precedents); invisible to dep-cruiser (stated).
- Auth provider swap: `auth.ts` + 5 dependents, radius known.
- Multi-user or deployment: re-run this review — distance assumptions collapse.

*Method note: single run. Their finding stands — rerun on fresh context before acting, especially on findings 1–2.*
