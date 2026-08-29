
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
  store secrets), tool list, installed skills count, the design tokens from
  `src/styles/global.css`, and a per-turn context token estimate (base prompt +
  project instructions + active session branch). `v1` = initial capture at
  setup; new snapshots bump the version.

## Conventions

- Adding a mod: use the `/admin` form (POST `/api/mods`) or extend the seed
  list in `scripts/seed.ts`. Slug must be unique — auto-generated from title.
- Status semantics: `considered` = we evaluated it; `implemented` = live in the
  current harness; `wanted` = on the shortlist.
- Snapshot flows: when the harness changes (provider/model/token/design
  tokens), take a snapshot from `/admin` → the harness map shows the current
  version and the timeline of all versions.
- Design tokens live only in `src/styles/global.css` (dark block + light
  override) — the harness snapshot parses them, so update the CSS, then
  re-snapshot.
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