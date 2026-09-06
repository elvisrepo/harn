
Principles (values to apply with judgment — they outrank other guidance when things conflict):
- Minimalism: only the code the immediate problem needs; no speculative features, abstractions, or predictive configs.
- Surgical edits: touch only the lines the task requires; leave adjacent code untouched.
- Goal-driven: break tasks into steps with explicit success criteria; verify before claiming done.
- Clarify, don't guess: state assumptions; halt on ambiguity.
- Receipts over prose: sensors/checks report stable, machine-readable facts — feed evidence back, not guesses.
- Sensors before handoff: run `npm run check` (build + behaviour flows) before declaring work done.
- Snapshots are point-in-time truth: diffs must never mislead; never silently rewrite history.
- Secrets only via env: never logged, echoed, or committed.
- Fix the kit first: recurring issues get fixed in skills/conventions/checks, not just this instance.

Cross-functional requirements (CfRs — standing quality bars for this project; they are the
"how the system performs" tiebreakers; where possible, translate them into testable
acceptance criteria):
- Security: secrets only via env — never logged, echoed, or committed; session cookies httpOnly; origin checks enforced.
- Data integrity: snapshots are point-in-time truth; no silent history rewrites; seeding/migrations idempotent.
- Environment portability: behaviour identical across dev / preview / production (watch AUTH_URL and NODE_ENV-dependent cookie flags) — verify in real conditions, not just dev.
- Real-browser usability: served URLs must work in actual browsers (content negotiation, cookies), not only via curl or scripted clients.
- Maintainability: typed artifacts, machine-readable receipts, kit-vs-instance separation (see docs/Harness reuse contract.md).
- Performance/scalability: explicitly loose — local single-user tool; do not over-engineer.

Reference docs (read on demand; single-source rule — they link to systems of record like
/harness and the snapshots, they do not copy drifting facts):
- docs/current-harness.md — how the harness works (turn flow, context model, skills, browser QA); verified at v7
- docs/Harness decisions.md — running decision record for the article review (Principles, CfRs, Ref Docs, Rules; the incidents that earned them)
- docs/Harness reuse contract.md — kit vs instance; read before instantiating the harness elsewhere or changing skills/conventions
- docs/Harness engineering for coding agent users.md — Böckeler's harness-engineering article condensed (guides/sensors/CfRs vocabulary)
- docs/Harness review — feedforward guides.md — working notes on the Guides/Sensors figure

Always begin by thinking deeply before you code—explicitly stating your assumptions,
surfacing tradeoffs, and halting to ask for clarification the moment you encounter ambiguity
rather than guessing silently.
Write only the absolute minimum amount of code required to solve the immediate problem,
strictly avoiding speculative features, unrequested abstractions, or predictive configurations.
When editing existing code, make highly surgical changes by restricting your updates only
to the exact lines necessary to fulfill the request, maintaining the existing style perfectly,
and leaving adjacent, unbroken code completely untouched unless your changes directly
orphaned an import or variable.
Finally, approach every task through goal-driven execution by breaking it down into a clear,
step-by-step plan with strong success criteria, such as writing a reproducing or failing test
first and independently looping through verification until that specific goal is strictly met.

Suggest what to add to the harness, if you see any repeatable workflows e.g.


# Harness Mods

A local web app for tracking ways to modify an AI agent harness (pi), with a
searchable catalog, per-mod detail notes, a graphical harness map, and
versioned snapshots of the harness config + tokens.

## Stack

- **Astro 7** — server output, `@astrojs/node` (standalone), vanilla JS + Mermaid on the client
- **better-auth 1.7** — email + password auth (SQLite via its drizzle adapter)
- **drizzle-orm + better-sqlite3** — local SQLite at `data/app.db`
- **marked** — markdown rendering for mod notes
- **mermaid** — harness diagram on `/harness`

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | dev server on http://127.0.0.1:4321 |
| `npm run build` | production build to `dist/` |
| `npm run preview` | preview the production build |
| `npm run db:push` | sync drizzle schema to SQLite (creates `data/app.db`) |
| `npm run db:seed` | seed/upsert mod catalog, admin user, harness v1 |
| `npm run db:setup` | `db:push` + `db:seed` |
| `npm run versions:export` | export harness snapshot history (v1..vN) to `data/harness-versions.json` (committable, no auth data) |
| `npm run versions:import` | restore snapshot history from that JSON on a fresh machine (`--force` to overwrite the placeholder v1) |
| `npm run check` | pre-handoff sensor: secrets scan + build + browser behaviour flows (self-boots preview if no server is up) |

Background-mode dev (`astro dev --background`) is available; manage with
`astro dev stop | status | logs`.

## Architecture

```
db/schema.ts            drizzle tables: user/session/account/verification, mods, harness_versions
db/client.ts            better-sqlite3 + drizzle singleton (DATABASE_PATH, default data/app.db)
src/lib/auth.ts         better-auth instance (drizzle adapter, secret from AUTH_SECRET)
src/lib/auth-client.ts  browser auth client (sign-in / sign-out)
src/lib/mods.ts         catalog queries + ModView mapping + slugify
src/lib/harness.ts      harness snapshot builder + version queries
src/lib/context.ts      per-turn context token measurement (chars÷4 estimate)
data/context-static.txt verbatim static-context sample (base prompt + tool schemas)
src/middleware.ts       session via auth.api.getSession; protects /admin
                        docs/archify/* artifacts before route negotiation
src/pages/
  index.astro                    searchable catalog (client-side filter)
  mods/[id].astro                detail page (markdown via marked)
  harness.astro                  mermaid map + snapshot panel + version timeline
  admin.astro                    mod CRUD + harness snapshot controls (auth-gated)
  login.astro                    email/password sign-in
  api/auth/[...all].ts           better-auth handlers (explicit exports — Astro 7
                                 ignores destructured `export const { GET }`)
  api/mods.ts                    GET list; POST/PUT/DELETE admin-only
  api/harness-versions.ts        GET list; POST snapshot; DELETE admin-only
scripts/seed.ts                  idempotent seed (mods upserted by slug, admin
                                 bootstrap, harness v1)
src/styles/global.css            design tokens + app styles
```

**Routes**: `/` catalog · `/mods/<slug>` detail · `/harness` map · `/admin` manage · `/login`

## Domain

- **mods** — catalog entries. Fields: `slug`, `title`, `category`, `summary`,
  `body` (markdown), `considered` 0/1, `implemented` 0/1, `wanted` 0/1,
  `tags` (JSON array), `links` (JSON array of `{label,url}`).
- **harness versions** — snapshots capturing provider/model (from
  `~/.pi/agent/settings.json`), credential token *status only* (masked — never
  store secrets), tool list, installed skills count, and a per-turn context
  token estimate (base prompt + project instructions + active session branch).
  `v1` = initial capture at setup; new snapshots bump the version.

## Conventions

- Adding a mod: use the `/admin` form (POST `/api/mods`) or extend the seed
  list in `scripts/seed.ts`. Slug must be unique — auto-generated from title.
  **Catalog is code**: any mod edit made through the `/admin` UI must be
  mirrored into `scripts/seed.ts`, or the next `db:seed` reverts it.
- Status semantics: `considered` = we evaluated it; `implemented` = live in the
  current harness; `wanted` = on the shortlist.
- Snapshot flows: when the harness changes (provider/model/token/design
  tokens), take a snapshot from `/admin` → the harness map shows the current
  version and the timeline of all versions.
- Design tokens live only in `src/styles/global.css` (dark block + light
  override) — the harness map's C4 diagram reads them at runtime for its
  palette; they are not part of the snapshot record.
- Skills: all 5 (`grilling`, `grill-me`, `to-spec`, `to-tickets`,
  `implement`) are canonically committed to this repo under `.pi/skills/`
  (pi discovers project-level skills there). Snapshots count the user-level
  (`~/.pi/agent/skills/`) and project-level (`.pi/skills/`) locations. Web
  search/scrape/crawl is handled by the global `firecrawl`
  skill family (Firecrawl CLI — `firecrawl --status`); the Firecrawl API key
  is configured via the CLI and is never read by this app. Architecture
  diagrams are produced by the global `archify` skill (Agent Skills standard):
  typed JSON IR → 9-gate validated interactive HTML; dogfood artifact lives at
  `public/docs/archify/harness-mods.architecture.html` (served at `/docs/archify/…`). grilling is
  trigger-invokable; the others are `disable-model-invocation`
  and run via `/skill:`. Pipeline artifacts (`docs/specs/`, `docs/tickets/`)
  are project files, not app data.
- Context measurement: tokens are an estimate (`chars ÷ 4` — the
  deepseek-v4-flash tokenizer isn't available); the static sample lives in
  `data/context-static.txt` (captured verbatim from a live session) and the
  session branch is parsed from the `~/.pi/agent/sessions/<project>/*.jsonl`
  parent chain at snapshot time. Both are read-only runtime facts.
- The `db/` and `.pi` paths are runtime concerns: `db/client.ts` honors
  `DATABASE_PATH`; harness facts are read from `~/.pi/agent/` at snapshot time.

## Environment (.env — gitignored)

- `AUTH_SECRET` — better-auth signing secret (required)
- `AUTH_URL` — canonical base URL (default http://127.0.0.1:4321)
- `DATABASE_PATH` — sqlite file (default `data/app.db`)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — used by `db:seed` to bootstrap the admin

## Auth & security

- Catalog + harness map are public; `/admin` and mutation APIs require a
  session (middleware redirect + API session check).
- Email/password via better-auth; the password hash and never the provider
  credential are stored. `auth.json` is only probed for existence — its
  contents are not read.
- `signUp` API is enabled for seeding convenience — no register UI exists.
- Astro's origin check blocks cross-site mutations; browser fetches send JSON
  `content-type`, which passes.

## Testing

No test suite yet — smoke-check flows manually:

1. `npm run db:setup`
2. `npm run dev`
3. Sign in at `/login` (seed admin) → `/admin` renders
4. `POST /api/mods`, `PUT`, `DELETE` with the session cookie (401 without)
5. `POST /api/harness-versions` → new version appears on `/harness`
6. `npm run build` for server render + bundling sanity