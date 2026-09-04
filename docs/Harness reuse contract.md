# Harness reuse contract — kit vs instance

This repo is the **forge**: the harness we build here (conventions, skills,
sensors, the tracking app) is meant to be instantiated on **every development
project**. This document is the contract that keeps the reusable part
portable and the project-specific part free to be specific.

## The two layers

| Layer | What it is | Lives where | May reference this repo's app? |
|---|---|---|---|
| **Kit** (portable) | Conventions + skills + sensor discipline that any project wants | `.pi/skills/`, the `npm run check` pattern, receipts, AGENTS.md *conventions* | Never |
| **Instance** | This project's concrete app: catalog, snapshots, C4 artifacts, seed data, auth, docs | `db/`, `data/`, `src/`, `scripts/seed.ts`, `public/docs/archify/`, `docs/…` | Yes — it is the app |

## Kit inventory (portable)

- **Skills** — `.pi/skills/`: `grilling` (trigger-invokable), `grill-me`,
  `to-spec`, `to-tickets`, `implement` (`disable-model-invocation`, run via
  `/skill:`). Project-agnostic by design.
- **Web facts + facts tooling** (global, not repo): `firecrawl` skill family
  (search/scrape/crawl) and `archify` (validated interactive diagrams).
- **browser-qa** — `.pi/skills/browser-qa/` + `playwright-core` devDep:
  console/DOM/error checks, `--eval`, sign-in flow, screenshots → convention
  `public/screenshots/` (served at `/screenshots/…`).
- **Check discipline (quality left)** — the pattern:
  `build + typecheck + browser-qa smoke` as one command that fails with a
  receipt; `implement` runs it before handoff and feeds failure evidence back.
- **Receipt discipline (policy)** — machine-readable outputs, stable facts,
  exact evidence + fix hints (like archify's diagnostics / browser-qa JSON):
  sensors produce signals **optimised for agent consumption**.
- **AGENTS.md conventions** — the *shape* (project instructions, env usage,
  idempotent setup) — not this doc's content.

### Kit rules

1. **Zero project-specific references** — no paths/URLs/credentials/data from
   this app. Secrets only via env (`ADMIN_EMAIL`/`ADMIN_PASSWORD`, etc.).
2. **Idempotent** — re-running setup/checks is safe (`db:setup`, `npm run check`).
3. **Receipts everywhere** — JSON or stable text; never unstructured guesswork.
4. **Drift → fix the kit first** — when a recurring issue is general, fix the
   skill/convention/check (steering loop); only fix the instance if it's
   app-specific.

## Instance inventory (this project)

- The **Harness Mods app**: Astro SSR, `db/`, `data/` (SQLite + c4 artifacts)
- **Snapshots + map** — `/harness`, versioned C4 files, diffs, v1…v7 history
- **Catalog mods + seed** — `scripts/seed.ts`, `src/pages/api/*`
- **Serving** — `public/docs/archify/…`, `/screenshots/…`
- **Docs** — `docs/current-harness.md`, this contract, article summaries

## How a new project instantiates the kit

1. Copy `.pi/skills/` (grilling pipeline + browser-qa) and the AGENTS.md
   convention skeleton; adapt env/stack.
2. Add the check discipline: `npm run check` = build + typecheck + browser-qa
   smokes for your app's pages; wire into `implement`.
3. Use the same sensor vocabulary: web facts (firecrawl) · diagrams with
   receipts (archify) · browser behavior (browser-qa) · tests at the seam.
4. Optionally run the catalog/snapshots instrument (this app or a lightweight
   equivalent) to *reason about the harness as a system* per project.
5. Topology is the only parameter: language/stack, domain, CI — the
   guides/sensors stay the same.

## Why this matters (from "Harness engineering for coding agent users")

The article's missing tooling — "configure, sync, and reason about guides and
sensors as a system" — is what this app *is*. The reuse contract is the handle
that lets the same harness be instantiated elsewhere without forking the
app-specific mess. See `docs/Harness engineering for coding agent users.md`.