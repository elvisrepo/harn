# Current harness — summary

_Verified at snapshot v7 (2026-09-03). Live facts live on `/harness` — this doc describes the
model and mechanisms, not the drifting numbers (single-source rule: link to systems of
record, don't copy them)._

## What the harness is

**pi coding agent v0.84.4** — a local AI coding-agent harness running with:

| Fact | Value (at v7 — live values on `/harness`) |
|---|---|
| Provider | opencode-go |
| Model | deepseek-v4-flash |
| Credential | `~/.pi/agent/auth.json` (presence only — never stored by this app) |
| Tools | `read` · `bash` · `edit` · `write` |
| Skills installed | 15 at v7 — global (`~/.pi/agent/skills`, incl. symlinks into `~/.agents/skills`): `firecrawl` family ×8, `archify`; project (`.pi/skills/`): `grilling`, `grill-me`, `to-spec`, `to-tickets`, `implement`, `browser-qa` |
| Agent guides | AGENTS.md — **Principles** (9) · **CfRs** (6) · reference-doc index (read every turn; decisions in `docs/Harness decisions.md`) |
| Per-turn context | ≈2.7k at v7 — session-branch-dependent; see the capture-time caveat on `/harness` |

## How a turn flows

1. **Load** — the TUI opens the session; the active branch of the session JSONL
   (parent-pointer tree) plus config/state are loaded.
2. **Compose** — the context assembler builds what the model sees: base system
   prompt → global + project instructions (AGENTS.md) → tool schemas →
   skill catalog (names/descriptions/locations only) → session branch +
   compaction → current message. Extension hooks can add/transform before the loop.
3. **Agent loop** — orchestration invokes tools, feeds results back, calls the
   model provider with the auth credential, resolves the model via
   models-store.json.
4. **Reply & persist** — the streamed reply returns to the TUI and the JSONL
   log is appended.

The full numbered cycle (1–13) is drawn in the C4 pipeline on `/harness`.

## Context size & caching

- The per-turn context is the whole active branch (plus compaction summaries);
  billed input is lower because the repeated prefix hits provider-side prompt
  caching (cache-read rate; breaks after ~5 min idle), and pi auto-compacts
  long sessions.
- Snapshots on `/harness` record the estimate; `data/context-static.txt` is the
  verbatim static-context sample.
- Capture-time caveat: the session-branch part varies with how long the session
  was when the snapshot was taken — drops/gains across versions are
  measurement, not regressions.

---

## Web search — how it works

There is **no built-in web search** in pi. Search is a **skill**: a SKILL.md
package whose body tells the model to run a local CLI. The model only sees the
skill's name/description/location in its catalog; when a task matches, it reads
the full body and executes the commands through the existing `bash` tool.

### firecrawl

The global **firecrawl** skill family (installed at `~/.pi/agent/skills/`)
wraps the **Firecrawl CLI** (`firecrawl`, npm-global):

- **Authenticated** via the CLI's stored Firecrawl API key (config lives in
  `firecrawl`'s own store — this app never reads it). Check health with
  `firecrawl --status` (shows credits + concurrency).
- **Commands** (each a separate skill in the family):
  - `firecrawl search "query"` — web search (`--scrape` fetches full content)
  - `firecrawl scrape <url>` — URL → clean LLM-optimized markdown
  - `firecrawl map` / `crawl` / `download` — site discovery & bulk extraction
  - `firecrawl interact` — clicks/form fills/pagination for JS-rendered pages
  - `firecrawl agent` — structured data extraction from complex sites
- **Costs are real money**: search = 2 credits / 10 results, scrape = 1 credit
  / page, `--query` = 5 credits/page (free tier ≈ 1,000/month). The skills
  instruct the model to keep `--limit` ≤ 10 and scrape only the top 1–2 hits,
  and to write outputs to `.firecrawl/` instead of the context window.

There is **no OSS code-grep skill** (the old `code-search`/`ketch` was
removed); `firecrawl search --categories github` only filters web results,
it does not grep real source.

## The skills — details

Matt Pocock–style engineering skills, adapted for pi and local tooling:

1. **`grilling`** (trigger-invokable) — the design interview. Builds a **design
   tree** of every decision, asks it in **rounds** (whole frontier at once,
   numbered questions with a recommended answer each), looks up all *facts*
   itself via the firecrawl search skills (never asks the user what it can look
   up), and
   ends when the frontier is empty and the user confirms shared understanding.
   For greenfield fullstack projects it seeds the tree from a **14-area
   coverage list** (requirements → architecture → risks/compliance →
   integrations → data lifecycle → dev env → backend → frontend → testing →
   infra/DevOps → deployment → monitoring → release → post-launch); for new
   features it uses only the applicable subset.
2. **`to-spec`** (`/skill:to-spec`) — no-interview synthesis of the confirmed
   tree into `docs/specs/<slug>.md` (Problem/Solution/User Stories/
   Implementation Decisions/**CfRs**/**Test Seam**/Open Questions).
3. **`to-tickets`** (`/skill:to-tickets`) — breaks the spec into tracer-bullet
   **vertical slice** tickets at `docs/tickets/NN-<slug>.md` (full path through
   schema/API/UI/tests, demoable alone, one context window each, `blocks:`
   edges; wide refactors handled as expand–contract). Quiz the user on the
   breakdown before writing.
4. **`implement`** (`/skill:implement`) — one unblocked ticket at a time, TDD
   at the spec's seam, typecheck + targeted tests regularly, full suite at the
   end, self-review, commit with the ticket id.
5. **`grill-me`** (`/skill:grill-me`) — explicit entry point that runs the
   grilling protocol.
6. **`browser-qa`** (project skill, not pipeline) — headless-Playwright
   sensor for the app itself; see the section below.

Globals (installed outside this repo): `firecrawl` family (web
search/scrape — section above) and `archify` (validated interactive
architecture diagrams; artifacts served at `/docs/archify/…`).

The pipeline artifacts (`docs/specs/`, `docs/tickets/`) live in the repo, not
in the harness app.

## Browser QA & screenshots

Local-repo browser testing is a **script-in-a-skill** (pi has no built-in MCP
client — `docs/usage.md`), powered by headless Playwright against system
Chrome (`playwright-core`, devDependency): `.pi/skills/browser-qa/`.

What `browser-qa` can do:

- **Error capture** — console errors/warnings, uncaught page errors, failed
  requests, per run.
- **DOM assertions** — `--assert` / `--reject` selectors, `--text` presence,
  `--wait` for a selector.
- **`--eval <js>` — the full browser DOM API** via `page.evaluate`: query the
  DOM, computed styles, `localStorage`, network state — anything a page script
  can do. Example on `/harness?v=6`:
  `{"svg":1,"pills":6,"snap":6,"iframes":2}` (mermaid rendered, 6 version
  pills, snapshot rows, two archify iframes).
- **Sign-in flow** — `--login` fills `#loginForm`, submits, waits for the
  `/admin` redirect (creds via `ADMIN_EMAIL`/`ADMIN_PASSWORD` env, never
  hardcoded; `--login-expect <path>` to override the landing).
- **Screenshots** — full-page PNGs written to `public/screenshots/`, served at
  `/screenshots/…` (e.g. `qa-harness-map.png`, `qa-admin.png`).

Run: `node .pi/skills/browser-qa/scripts/qa.mjs "<url>" [flags] --json`.
Dev-mode caveat: `npm run dev` emits Vite dev-toolbar 504s in headless runs, so
`--expect-error-free` is meaningful against the prod build (`npm run preview`).

**Can pi view images?** The `read` tool accepts PNG/JPG/GIF/WebP/BMP and
attaches them to the model — but the default model `deepseek-v4-flash` is
text-only, so image contents are omitted from the request. Point pi at a
multimodal model (Claude, GPT, …, via a vision-capable provider) and the agent
can actually look at screenshots and other images.