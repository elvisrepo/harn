#!/usr/bin/env bash
# Setup the harness on a fresh machine, entirely from the repo:
#   1. ketch binary  -> ~/.pi/agent/bin/ketch.exe  (nothing committed, downloaded from GitHub)
#   2. ketch config  -> backend firecrawl + API key (prompted, never written to git)
#   3. skills        -> .pi/skills/* copied to ~/.pi/agent/skills/ (global scope)
#   4. .env          -> checks the app's env file
#
# Usage: bash scripts/setup-harness.sh
set -euo pipefail

KETCH_BIN="$HOME/.pi/agent/bin/ketch.exe"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "== 1/4 ketch binary =="
if [ -x "$KETCH_BIN" ]; then
  echo "  already present: $("$KETCH_BIN" version 2>/dev/null | head -1)"
else
  mkdir -p "$(dirname "$KETCH_BIN")"
  TAG="$(curl -s https://api.github.com/repos/1broseidon/ketch/releases/latest | grep '"tag_name"' | sed 's/.*"tag_name": "\(.*\)",*/\1/')"
  echo "  downloading ketch ${TAG} (windows x86_64)…"
  curl -sL -o /tmp/ketch.zip "https://github.com/1broseidon/ketch/releases/download/${TAG}/ketch_${TAG#v}_windows_x86_64.zip"
  (cd /tmp && unzip -oq ketch.zip -d ketch-extract && mv -f ketch-extract/ketch.exe "$KETCH_BIN" && rm -rf ketch-extract ketch.zip)
  echo "  installed $("$KETCH_BIN" version | head -1)"
fi

echo "== 2/4 ketch config (backend: firecrawl) =="
"$KETCH_BIN" config init >/dev/null 2>&1 || true
"$KETCH_BIN" config set backend firecrawl >/dev/null
KEY_SET="$("$KETCH_BIN" config 2>/dev/null | grep -o '"firecrawl_api_key_set": [a-z]*' | cut -d' ' -f2)"
if [ "$KEY_SET" != "true" ]; then
  printf '  Firecrawl API key (https://firecrawl.dev) — pasted here stays local: '
  read -r KEY
  "$KETCH_BIN" config set firecrawl_api_key "$KEY" >/dev/null
  echo "  key stored in %APPDATA%\\ketch\\config.json"
else
  echo "  firecrawl key already configured"
fi

echo "== 3/4 skills -> ~/.pi/agent/skills =="
mkdir -p "$HOME/.pi/agent/skills"
for skill in "$REPO_DIR"/.pi/skills/*/; do
  [ -d "$skill" ] || continue
  name="$(basename "$skill")"
  dest="$HOME/.pi/agent/skills/$name"
  if [ -e "$dest" ]; then
    echo "  $name — exists, skipped"
  else
    cp -r "$skill" "$dest"
    echo "  $name — installed (global)"
  fi
done
echo "  note: when working inside this repo, pi also sees .pi/skills/ directly —"
echo "        delete the user-level copies there to avoid duplicate-name warnings."

echo "== 4/4 app .env =="
if [ -f "$REPO_DIR/.env" ]; then
  echo "  .env present"
else
  echo "  .env missing — create one with:"
  echo "    AUTH_SECRET=<random>"
  echo "    AUTH_URL=http://127.0.0.1:4321"
  echo "    ADMIN_EMAIL=<you>@example.com  ADMIN_PASSWORD=<long>"
  echo "  then: npm install && npm run db:setup && npm run dev"
fi

echo "Done."