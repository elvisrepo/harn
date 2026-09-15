---
name: modularity
description: Balanced-Coupling modularity review or design via the global modularity skills. Use when assessing architecture quality, reviewing coupling, or designing module structure. Evidence comes from scripts/coupling.mjs, interviews run grilling-style in chat.
disable-model-invocation: true
---

# Modularity (adapter)

Runs the global `modularity-review` / `modularity-design` skills
(Vlad Khononov, Balanced Coupling model — CC BY-NC-SA 4.0, see
`~/.agents/skills/modularity/LICENSE`; upstream bodies kept verbatim)
inside this harness, where Claude-isms don't exist. This file maps each
one; read the mapped sources directly, never assume Claude tooling.

## Sources

- Review: `~/.pi/agent/skills/modularity-review/SKILL.md` (+ `../modularity-design`)
- Model reference: `~/.agents/skills/modularity/skills/balanced-coupling/SKILL.md`
- Output format: `~/.agents/skills/modularity/skills/document/SKILL.md` (Markdown required; HTML optional)

## Adaptations (Claude → here)

- `AskUserQuestion` → grilling-style rounds in chat: whole frontier at
  once, numbered questions with a recommended answer each (see
  `.pi/skills/grilling/SKILL.md`). One round per skill step that needs
  input, never more.
- `TaskCreate`/`TaskUpdate` → todowrite (one `in_progress` at a time).
- `$ARGUMENTS` → explicit path argument in the invoking message.
- `LSP (findReferences, goToDefinition)` → `grep`/`read` plus the
  `diagnostics` probe where available (pi-only).
- Skill `skills:` deps → read the support SKILL.md files above yourself.

## Evidence (deterministic first — ours, not theirs)

Before any judgment, run and quote:

- `node scripts/coupling.mjs hotspots --top 10` (fan-in/fan-out)
- `node scripts/coupling.mjs cycles`
- `node scripts/coupling.mjs impact <touched-files...>` for the diff under review
- `npx depcruise --validate .dependency-cruiser.mjs src db scripts test .pi` (layer conformation)

Numbers ground the analysis; appropriateness stays a judgment call —
their article's lesson verbatim: legitimate hubs (DB singleton, shared
contracts) must be acquitted with reasons, and every acquittal goes in
the report or it becomes noise next run.

## Review path (`/skill:modularity` + "review …")

Follow the review SKILL.md's 4 steps (domain → integrations → balance
rule → document), writing the review to `docs/modularity-<slug>.md`.
Run the analysis twice on fresh context for anything load-bearing
(their finding: second runs surface different issues).

## Design path (`/skill:modularity` + "design …")

Follow the design SKILL.md's 6 steps; module docs land in `docs/`,
test specs beside them. Approval after every step, like grilling rounds.
