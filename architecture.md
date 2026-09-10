# Architecture — Harness Mods app

Buddy doc for the agent: what this app is, how requests flow, where things
live. Read before changing any route, table, or data flow. Live numbers live
on `/harness` — this doc describes structure, not drifting values.

## What it is

Astro 7 SSR (`output: 'server'`, `@astrojs/node` standalone) + better-auth
(email/password) + drizzle-orm over local SQLite (`data/app.db` via
`DATABASE_PATH`). Vanilla JS + Mermaid on the client. Port 4321.

## Routes (pages + APIs)

| Route | File | Auth | Notes |
|---|---|---|---|
| `/` | `src/pages/index.astro` | public | searchable catalog; client-side filter JS in-page |
| `/mods/<slug>` | `src/pages/mods/[id].astro` | public | markdown `body` rendered via marked |
| `/harness` | `src/pages/harness.astro` | public | mermaid map (`C4Diagram.astro`) + snapshot panel + `?v=N` switcher |
| `/login` | `src/pages/login.astro` | public | `#loginForm` → `auth-client` sign-in, redirects to `/admin` |
| `/admin` | `src/pages/admin.astro` | session (middleware redirect) | mod CRUD form + snapshot buttons; embeds mods JSON for the client |
| `/api/mods` | `src/pages/api/mods.ts` | GET public; mutations session-checked | list / create / update / delete |
| `/api/harness-versions` | `src/pages/api/harness-versions.ts` | GET public; POST/DELETE session-checked | list / snapshot (auto-bumps version + writes `data/c4/vN.mmd`) / delete |
| `/api/auth/[...all]` | `src/pages/api/auth/[...all].ts` | — | better-auth handler; explicit `GET`/`POST` exports (Astro 7 ignores destructured re-exports) |

Shared shell: `src/layouts/Base.astro` + `src/components/Header.astro`.
`src/components/C4Diagram.astro` renders the versioned graph client-side.

## Request pipeline

`src/middleware.ts` → `Astro.locals.session` via `auth.api.getSession` on
every request; `/admin*` without a session redirects to `/login`. Mutation
APIs re-check the session themselves (never trust the page gate alone).
better-auth enforces `Origin` on browser-like writes and JSON
`content-type` (see the thin-suite login tests — curl without `Origin`
behaves differently from a browser fetch).

## Data

`db/schema.ts` → `db/client.ts` singleton. better-auth tables
(`user`, `session`, `account`, `verification` — password hash in
`account.password`, never a provider credential). App tables:

- `mods` — `slug` unique; `considered`/`implemented`/`wanted` are 0/1;
  `tags`/`links` are JSON text. Seed (`scripts/seed.ts`) upserts by slug —
  **catalog is code**: UI edits must be mirrored into the seed.
- `harness_versions` — `version` unique int; `snapshot` is JSON text
  (provider/model, token *status only*, tools, skills, context estimate).

Snapshots: `src/lib/harness.ts` (`buildSnapshot` reads `~/.pi/agent/`,
`createHarnessVersion` bumps + calls `ensureC4Artifact`);
`src/lib/c4.ts` builds the mermaid source per version;
`data/harness-versions.json` is the portable export (no auth data).

## Static serving gotcha (earned, do not regress)

Browsers send `Accept: text/html`; Astro's dev router 404s non-page paths
for it. So `public/docs/archify/*` and `public/screenshots/*` are served
from `public/` (static), never from routes or middleware. Both Accept
shapes are pinned by tests.

## Client-side JS

In-page scripts (catalog filter, mermaid render, admin form). Design tokens
live only in `src/styles/global.css` (dark block + light override) — the C4
diagram reads them at runtime; they are not snapshot data.

## Where behaviour is proven

`test/app.test.mjs` (HTTP seams) · `test/lib.test.mjs` (pure lib) ·
`scripts/qa-flows.mjs` (browser) — all inside `npm run check`.
