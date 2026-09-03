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
| `--shot <path.png>` | full-page screenshot |
| `--expect-error-free` | fail on any console error / pageerror / failed request |
| `--json` | machine-readable report |

Exit codes: `0` pass · `1` checks failed · `2` usage/launch error.

## Handy harness-app smoke tests

```bash
# catalog loads, no console errors, has 16+ mod titles
node .pi/skills/browser-qa/scripts/qa.mjs http://127.0.0.1:4321/ --assert "main" --text "Harness Mods" --expect-error-free --shot /tmp/catalog.png --json

# harness map: switcher + mermaid diagram render + archify iframes mount
node .pi/skills/browser-qa/scripts/qa.mjs "http://127.0.0.1:4321/harness?v=6" --assert ".ver-switch .vs-item" --assert "#harness-mermaid" --reject "#harness-mermaid:has(p.muted.small:has-text(404))" --shot /tmp/map-v6.png --json

# login page renders, then real login flow (cookie) via --wait redirect
node .pi/skills/browser-qa/scripts/qa.mjs http://127.0.0.1:4321/login --assert "input[type=email]" --assert "input[type=password]" --expect-error-free

# archify artifact served same-origin (no 404, diagram present)
node .pi/skills/browser-qa/scripts/qa.mjs http://127.0.0.1:4321/docs/archify/harness-mods.architecture.html --assert "svg" --reject ".mermaid" --shot /tmp/archify.png
```

For login-dependent flows, pass an authenticated cookie or drive the form with a
custom Playwright script; `qa.mjs` stays a stateless smoke/QA runner.