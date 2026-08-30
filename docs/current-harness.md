# Current harness — summary

_As of snapshot v3 · "firecrawl key wired" (see `/harness` for live facts)._

## What the harness is

**pi coding agent v0.84.4** — a local AI coding-agent harness running with:

| Fact | Value |
|---|---|
| Provider | opencode-go |
| Model | deepseek-v4-flash |
| Credential | `~/.pi/agent/auth.json` (presence only — never stored by this app) |
| Tools | `read` · `bash` · `edit` · `write` |
| Skills installed | 2 — `web-search`, `code-search` |
| Per-turn context | ≈40k tokens (measured at snapshot time; chars÷4 estimate — the model tokenizer isn't available) |

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

---

## Web search — how it works

There is **no built-in web search** in pi. Search is a **skill**: a
SKILL.md package in `~/.pi/agent/skills/` whose body tells the model to run a
local CLI called **ketch**. The model only sees the skill's
name/description/location in its catalog; when a task matches, it reads the
full body and executes the commands through the existing `bash` tool.

### ketch

- **Binary**: `~/.pi/agent/bin/ketch.exe` (vendored like `fd.exe`/`rg.exe`);
  stateless, single binary, no daemon.
- **Config**: `%APPDATA%\ketch\config.json` — backend **firecrawl** with the
  user's API key. The key lives only in that file; this app never reads it.
  Keyless fallbacks (`--backend exa` / `keenable` / `ddg`) work without setup.
- **Output**: `--json` everywhere (shape varies by backend — `--minimal` is
  the stable tab-separated fallback); documented exit codes (2/3/4/5/6);
  `ketch doctor` health-checks all backends.

### `web-search` skill

```bash
ketch search "query" --limit 10 --json          # Firecrawl backend (default)
ketch search "query" --limit 3 --scrape --json  # + full content per result
ketch scrape <url> --json                       # URL → clean markdown
ketch crawl <url> --limit 20                    # site crawl
```

- **Costs**: Firecrawl search = 2 credits / 10 results, scrape = 1 credit /
  page (free tier ≈ 1,000 credits/month). The skill instructs the model to
  keep `--limit` ≤ 10 and scrape only the top 1–2 hits.
- The agent can search, get ranked results with snippets, then scrape the
  relevant pages into markdown — all as structured output the model can read
  in-context.

### `code-search` skill

```bash
ketch code "query" --lang go --limit 5          # grep.app (zero config)
ketch code "query" --backend sourcegraph        # fallback when grep.app is slow
```

Real OSS source across public repositories — for API usage examples,
signatures, and copyable implementations.

### Where this shows up

- Skill catalog in the agent context: `web-search`, `code-search`.
- Snapshots on `/harness` record `skills installed: 2` (tools remain
  `read/bash/edit/write` — ketch is not a registered tool).
- The C4 pipeline diagram shows the `🔎 Web search · ketch (firecrawl ·
  keyless fallback)` node in the agent-loop stage with the `7 · research:
  search/scrape` edge.