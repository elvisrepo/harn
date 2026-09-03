---
name: browser-qa
description: Headless browser QA for local web apps via Playwright (system Chrome). Open a URL, capture console errors, page errors, and failed requests, run DOM assertions (--assert/--reject selectors, text presence), and take full-page screenshots. Use for login-flow checks, console/DOM verification, visual QA, and end-to-end smoke tests of the harness app (http://127.0.0.1:4321) or any local page.
---

# browser-qa

Quick, scriptable browser checks without an MCP server — pi has no MCP client, so
headless Playwright against system Chrome is the local-repo way (matches "a
script inside a skill is better" for local workflows).

## Run

```bash
node .pi/skills/browser-qa/scripts/qa.mjs "<url>" [flags] --json
```

Requires `playwright-core` (installed in this repo's devDependencies) and a
Chrome binary (`CHROME_BIN` env or `/usr/bin/google-chrome`).

## Flags

| Flag | Meaning |
|---|---|
| `--timeout <ms>` | goto timeout (default 20000) |
| `--wait <sel>` | wait up to 10s for a selector before checks |
| `--assert <sel>` | fail if zero matches |
| `--reject <sel>` | fail if any match |
| `--text <str>` | fail if page body doesn't contain the text |
| `--eval <js-expr>` | run arbitrary JS in the page (`page.evaluate`) — full browser DOM API: `document.querySelectorAll(...).length`, computed styles, `localStorage`, fetch state, etc. Result → `report.eval` |
| `--login` | run the sign-in flow first (fills `#loginForm`, submits, waits off `/login`) |
| `--email / --password` | credentials (falls back to `ADMIN_EMAIL` / `ADMIN_PASSWORD` env) |
| `--login-expect <path>` | require landing here after login (default `/admin`) |
| `--shot <path.png>` | full-page screenshot |
| `--expect-error-free` | fail on any console error / pageerror / failed request |
| `--json` | machine-readable report |

Exit codes: `0` pass · `1` checks failed · `2` usage/launch error.

## Handy harness-app smoke tests

Screenshots go to `public/screenshots/` (served at `/screenshots/…`):

```bash
# catalog loads, no console errors, has a main block
node .pi/skills/browser-qa/scripts/qa.mjs http://127.0.0.1:4321/ --assert "main" --text "Harness Mods" --shot public/screenshots/catalog.png --json

# harness map: switcher + mermaid diagram render
node .pi/skills/browser-qa/scripts/qa.mjs "http://127.0.0.1:4321/harness?v=6" --assert ".ver-switch .vs-item" --assert "#harness-mermaid" --shot public/screenshots/map-v6.png --json

# login page renders, then full sign-in flow -> /admin (creds via env, never in the file)
set -a; source .env; set +a
node .pi/skills/browser-qa/scripts/qa.mjs http://127.0.0.1:4321/login --login --assert "h1" --shot public/screenshots/qa-admin.png

# arbitrary browser-DOM introspection (mermaid rendered? pills? iframes?)
node .pi/skills/browser-qa/scripts/qa.mjs "http://127.0.0.1:4321/harness?v=6" --eval '({svg: document.querySelectorAll("#harness-mermaid svg").length, pills: document.querySelectorAll(".vs-item").length, iframes: document.querySelectorAll("iframe").length})' --json

# archify artifact served same-origin (no 404, svg present)
node .pi/skills/browser-qa/scripts/qa.mjs http://127.0.0.1:4321/docs/archify/harness-mods.architecture.html --assert "svg" --shot public/screenshots/archify.png
```

> Credentials: never hardcode secrets in the skill — pass via env (`source .env`)
> or `--email/--password` per run.
>
> Dev-mode note: `npm run dev` emits Vite dev-toolbar 504s/aborted requests in
> headless runs, so `--expect-error-free` is best used against the prod build
> (`npm run build && npm run preview`) or with that check omitted in dev.

For login-dependent flows, pass an authenticated cookie or drive the form with a
custom Playwright script; `qa.mjs` stays a stateless smoke/QA runner.