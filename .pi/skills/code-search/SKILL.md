---
name: code-search
description: Search real open-source code across public repositories via the ketch CLI (grep.app, Sourcegraph, or GitHub Code Search backends). Use to find OSS usage examples, API signatures, library internals, and copyable implementations.
---

# Code search (ketch)

Grep real OSS source with the `ketch` binary — no browser, no daemon.

## Binary

```bash
KETCH="$HOME/.pi/agent/bin/ketch.exe"    # or plain `ketch` if on PATH
```

## Search code

```bash
"$KETCH" code "http.NewRequestWithContext" --lang go --limit 5
"$KETCH" code "def load_config" --lang python --limit 10 --backend sourcegraph
"$KETCH" code "setAttribute('stroke-dasharray'" --limit 5 --json
```

- Backends: `grepapp` (default, no setup), `sourcegraph` (no setup — good fallback when grep.app is
  slow/504s), `github` (needs `gh auth login`, `$GITHUB_TOKEN`, or `ketch config set github_token`).
- `--lang <lang>` narrows by language; `--json` for structured output; `--minimal` for one line per hit.
- Exit codes: `0` ok · `2` bad input · `3` not found · `4` upstream/network failure · `5` missing precondition.

## When to use

- "How do other projects call this API / configure this library?"
- Verify a function signature or a release name against real source.
- Copy a proven implementation pattern and adapt it, citing the repo path.