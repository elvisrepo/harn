# Direction + working agreements

The strategy and collaboration facts an agent cannot infer from code —
recorded so future runs don't have to guess. Correct me when any of it
goes stale; staleness here misleads every turn.

## Where this is going

Local single-user tool, indefinitely. No multi-user, no deployment, no
sharing on the horizon (confirmed 2026-09-15 — a strategic shift
re-opens volatility, SLO, and runtime-sensor decisions).

## Runtime: opencode, pi conventions

Since 2026-09-09 the harness runs under **opencode** while keeping the
pi harness conventions (AGENTS.md, skills, `check` discipline). Facts a
future agent will trip on without this paragraph:

- `.pi/skills/` and `.pi/extensions/` are pi-shaped paths. The LSP
  extension (`.pi/extensions/lsp-diagnostics/`) does **not** execute
  under opencode — batch `astro check` is the portable cover.
- There is no `opencode.json`; no MCP servers are configured (recorded
  decision, not an oversight).
- Snapshots still read `~/.pi/agent/` facts (pi-side settings/skills) —
  that is the measured harness, even when the driver is opencode.

## Working agreements (human ↔ agent)

- **Commits/pushes are the human's.** The agent never commits, amends,
  pushes, or opens PRs unless explicitly asked — it leaves work
  uncommitted and says so. CI runs on push; the human watches it.
- **Snapshots follow harness changes** (skills, provider/model,
  conventions, sensors, map), then `versions:export`. Versions are
  never rewritten.
- **Catalog is code** (`scripts/seed.ts` + reseed); **check before
  handoff** (`npm run check` green); **verify in a real browser** on
  user-facing change.
- **Record as we go:** review outcomes land in `docs/Harness
  decisions.md` (reasoning + incidents), user-facing entries in the
  catalog, running state in snapshots. Chat is volatile memory; the
  repo is durable memory.
