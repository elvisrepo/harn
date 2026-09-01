---
name: web-search
description: Web search and page content extraction via the ketch CLI (Firecrawl backend by default; Exa/DuckDuckGo keyless fallback). Use for searching the web, documentation, facts, and converting URLs to clean markdown.
---

# Web search (ketch)

Search the web and extract page content using the `ketch` binary. Stateless, no server; run it as a shell command and read structured output.

## Binary

```bash
KETCH="$HOME/.pi/agent/bin/ketch.exe"    # or plain `ketch` if on PATH
```

## Search

```bash
"$KETCH" search "query" --limit 10 --json          # structured JSON
"$KETCH" search "query" --limit 10 --minimal       # stable: url\t title per line (shape-independent)
"$KETCH" search "query" --limit 3 --scrape --json  # fetch + extract full content for each result
```

- Default backend: **firecrawl** (configured). Keyless fallbacks that usually work without setup:
  `--backend exa`, `--backend keenable`, `--backend ddg` (DDG rate-limits easily).
  Federate several at once with `--multi` (rank-fused, deduped), or `--random` to stop at the first success.
- **JSON output shape varies by backend** — prefer `--minimal` when you just need URLs + titles, or
  inspect the JSON before assuming a field name.
- Refresh filters: `--freshness pd|pw|pm|py` or `YYYY-MM-DDtoYYYY-MM-DD`; region: `--country XX`.

## Scrape / extract

```bash
"$KETCH" scrape https://example.com --json          # URL -> clean markdown (HTML/PDF)
curl -L https://example.com | "$KETCH" extract      # piped HTML -> markdown (no fetch/cache)
"$KETCH" crawl https://example.com --limit 20       # site crawl (BFS/sitemap)
```

JS-rendered pages may need the browser fallback: `ketch browser install` then `ketch config set browser chrome`.

## Costs (Firecrawl backend)

Credits are real money: **search = 2 credits / 10 results** (rounded up), **scrape = 1 credit / page**.
Keep `--limit` ≤ 10; scrape only the 1–2 relevant hits, not every result. A 403/404 still charges.

## Exit codes (control flow)

`0` ok · `2` bad input · `3` not found · `4` upstream/network failure · `5` missing precondition (e.g. no API key) · `6` cancelled.

## Health

```bash
"$KETCH" doctor     # backend/browser/cache health; exit 0 healthy, 5 broken
```