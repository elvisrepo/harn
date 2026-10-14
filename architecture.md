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
| `/` | `src/pages/index.astro` | public | searchable catalog; URL-backed client-side filters + result count |
| `/articles` | `src/pages/articles.astro` | public | reading list: 3 papers × linked mods (matched on mod links) + unmapped |
| `/mods/<slug>` | `src/pages/mods/[id].astro` | public | markdown `body` rendered via marked |
| `/harness` | `src/pages/harness.astro` | public | snapshot facts + expandable mermaid map (`C4Diagram.astro`) + `?v=N` selector |
| `/login` | `src/pages/login.astro` | public | `#loginForm` → `auth-client` sign-in, redirects to `/admin` |
| `/register` | `src/pages/register.astro` | public | `#registerForm` → `auth-client` sign-up, redirects to the catalog |
| `/admin` | `src/pages/admin.astro` | session (middleware redirect) | searchable mod list + CRUD form + snapshot buttons; unsaved-edit guard; embeds mods JSON for the client |
| `/api/mods` | `src/pages/api/mods.ts` | GET public; mutations session-checked | list / create / update / delete |
| `/api/harness-versions` | `src/pages/api/harness-versions.ts` | GET public; POST/DELETE session-checked | list / snapshot (auto-bumps version + writes `data/c4/vN.mmd`) / delete |
| `/api/metrics` | `src/pages/api/metrics.ts` | public | Prometheus text exposition (requests, avg/p50 ms, by-status/path) |
| `/api/traces` | `src/pages/api/traces.ts` | public | recent request traces, newest first (`?limit`, ring-capped) |
| `/api/auth/[...all]` | `src/pages/api/auth/[...all].ts` | — | better-auth handler; explicit `GET`/`POST` exports (Astro 7 ignores destructured re-exports) |

Shared shell: `src/layouts/Base.astro` + `src/components/Header.astro`.
`src/components/C4Diagram.astro` renders the versioned graph client-side.

## File map

```
db/schema.ts            drizzle tables: user/session/account/verification, mods, harness_versions
db/client.ts            better-sqlite3 + drizzle singleton (DATABASE_PATH, default data/app.db)
src/lib/auth.ts         better-auth instance (drizzle adapter, secret from AUTH_SECRET)
src/lib/auth-client.ts  browser auth client (sign-in / sign-out)
src/lib/mods.ts         catalog queries + ModView mapping + slugify
src/lib/harness.ts      harness snapshot builder + version queries
src/lib/context.ts      per-turn context token measurement (chars÷4 estimate)
src/lib/c4.ts           versioned C4 mermaid builder (data/c4/v<N>.mmd artifacts)
src/lib/observability.ts JSONL access log + Prometheus metrics + trace ring (X-Request-Id)
data/context-static.txt verbatim static-context sample (base prompt + tool schemas)
data/c4/v<N>.mmd        versioned C4 artifact per snapshot (LSP loop since v9)
data/harness-versions.json portable snapshot history (v1..vN, no auth data)
src/middleware.ts       session via auth.api.getSession; protects /admin;
                        starts/finishes observability traces (X-Request-Id)
.pi/extensions/lsp-diagnostics/ pi-only LSP client (diagnostics receipts on edit/write/bash + diagnostics probe)
.pi/skills/browser-qa/  headless-Playwright sensor + qa.mjs runner
test/helpers.mjs        suite server conventions (APP_URL or self-booted preview)
test/app.test.mjs       HTTP seam tests mirroring the qa-flows
test/lib.test.mjs       unit tests over the pure lib core
eslint.config.mjs       flat lint config (recommended minus tsc-covered noise)
.semgrep/rules.yml      earned rules (no absolute-local fetch, no eval)
.dependency-cruiser.mjs layer rules (routes→lib→db, ops aside, extension isolated)
scripts/check-secrets.mjs credential-pattern scanner (file:line, never echoes values)
scripts/qa-flows.mjs    browser behaviour flows (self-boots preview, reaps via preview stop)
scripts/qa-usability.mjs mobile filters/layout, snapshot navigation, reading shortlist, authenticated editing
scripts/boot-preview.mjs shared dev/preview boot (qa-flows + thin suite)
scripts/coupling.mjs    TS-compiler fan-in/fan-out + cycles + dashboard
scripts/export-versions.mjs / import-versions.mjs portable history round-trip
scripts/seed.ts         idempotent seed (mods upserted by slug, admin bootstrap, harness v1)
src/styles/global.css   design tokens + app styles
```

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

In-page scripts (catalog filter, mermaid render, admin form). **Astro
`<style>` blocks are scoped to compile-time markup: DOM nodes created at
runtime by page scripts never get the scope attribute, so their CSS must
use `:global(...)` selectors** (earned: the Preferred list rendered
unstyled until its rules went global). The reading shortlist remains localStorage-only; Wanted is the separate catalog flag.
Catalog detail links carry a validated relative return URL.
Design tokens
live only in `src/styles/global.css` (dark block + light override) — the C4
diagram reads them at runtime; they are not snapshot data.

## Where behaviour is proven

`test/app.test.mjs` (HTTP seams) · `test/lib.test.mjs` (pure lib) ·
`scripts/qa-flows.mjs` (browser) — all inside `npm run check`.
