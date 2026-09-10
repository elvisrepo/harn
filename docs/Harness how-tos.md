# Harness how-tos

Step-by-step procedures for this repo's recurring harness operations — the
verified paths, with expected receipts and the gotchas we hit earning them.
Principles: exact commands, verify each step, never echo secret values.

Related: `docs/current-harness.md` (how the harness works) ·
`docs/Harness decisions.md` (decisions record) ·
`docs/Harness reuse contract.md` (kit vs instance).

---

## 1. Take a harness snapshot

Whenever the harness changes (skills, provider/model, conventions, sensors).

**Via the app:** sign in at `/login` → `/admin` → take snapshot.

**Via the API:**
```bash
set -a; source .env; set +a
curl -s -c /tmp/harn-cookie.txt -X POST http://127.0.0.1:4321/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" -o /dev/null -w "signin %{http_code}\n"   # expect 200
curl -s -b /tmp/harn-cookie.txt -X POST http://127.0.0.1:4321/api/harness-versions \
  -H "Content-Type: application/json" \
  -d '{"label":"<short label>","summary":"<what changed and why>"}' \
  -w "\npost %{http_code}\n"    # expect 201 + {"id":…,"version":N}
```

**Then keep the portable history current:**
```bash
npm run versions:export   # receipt: "exported N version(s) → data/harness-versions.json"
git add data/harness-versions.json
```
*Gotchas:* seed only creates v1 if NO versions exist; on a fresh machine use
`versions:import -- --force` (overwrite the placeholder v1). The C4 artifact
`data/c4/v<N>.mmd` is generated automatically at snapshot time.

---

## 2. Set up on a new machine

```bash
git clone <repo> && cd harn
npm install                       # engines: node >= 22.12 (includes eslint)
pip install --user semgrep        # structural lint sensor (binary lands in ~/.local/bin — ensure it is on PATH)
cat > .env <<'EOF'                # NEVER commit this file
AUTH_SECRET=<random>
AUTH_URL=http://127.0.0.1:4321
ADMIN_EMAIL=<you>@example.com
ADMIN_PASSWORD=<long random>
EOF
npm run db:setup                  # schema + 19 mods + fresh admin + placeholder v1
npm run versions:import -- --force   # restore v1..vN history from the committed JSON
npm run check                     # build + secrets scan + 4 behaviour flows (self-boots preview)
```
Expected receipt: `check` exits 0, all flows `✓` with 0 console errors.

*Gotchas:*
- Browser: system Chrome at `/usr/bin/google-chrome` (or set `CHROME_BIN`);
  Playwright browsers may also be cached in `~/.cache/ms-playwright`.
- `versions:import` default **skips existing versions** (no silent rewrites) —
  `--force` overwrites the placeholder v1.
- Run `npm run dev` for day-to-day work (http://127.0.0.1:4321).

---

## 3. Rotate leaked / exposed secrets

The procedure we ran after `.env` was accidentally committed and pushed.

```bash
# 1. If the file is tracked: stop shipping it (local file is kept)
git rm --cached .env && git commit -m "security: untrack .env"

# 2. Rotate the values in .env (never echo them):
python3 - <<'EOF'
import secrets, re
p = open('.env').read()
for key in ('AUTH_SECRET', 'ADMIN_PASSWORD'):   # any env secret to rotate
    p = re.sub(key + r'=.*', key + '=' + secrets.token_urlsafe(24), p)
open('.env','w').write(p)
print('rotated')
EOF

# 3. Recreate the admin (old hash is derived from the exposed password):
node --experimental-strip-types -e "import Database from 'better-sqlite3';const db=new Database('data/app.db');db.prepare('DELETE FROM user').run();console.log('admin wiped');db.close();"
set -a; source .env; set +a; npm run db:seed   # recreates admin from new ADMIN_PASSWORD

# 4. Verify end-to-end:
node .pi/skills/browser-qa/scripts/qa.mjs http://127.0.0.1:4321/login --login --json
# expect: "login": {"ok": true, "landed": ".../admin"}
```

*Gotchas:*
- **Tracked files override `.gitignore`** — that is how `.env` got committed
  despite being ignored. Untrack first.
- Removing the file does **not** scrub git history: on GitHub the old secrets
  remain reachable until a history rewrite
  (`git filter-repo --path .env --invert-paths` + force-push). Rotation makes
  them useless; scrub if the repo is public.
- `AUTH_SECRET` rotation invalidates existing sessions (expected).

---

## 4. Regenerate the archify diagrams

The diagrams are typed-JSON first; HTML is generated through the archify
skill's validate → deliver pipeline (9/9 showcase checks, receipt-driven).

```bash
# 1. Edit the typed source: public/docs/archify/<name>.json
#    (schema + examples: ~/.agents/skills/archify/schemas/, examples/)

# 2. Validate (repair loop: fix exactly what the diagnostics name, re-run):
cd ~/.agents/skills/archify
node bin/archify.mjs validate architecture /home/sevi/harn/public/docs/archify/harness-mods.architecture.json --quality showcase --json
# expect: ok:true, 9/9 checks, composition pass

# 3. Deliver (atomically replaces the HTML, emits SHA-256 receipt):
node bin/archify.mjs deliver architecture <json> /home/sevi/harn/public/docs/archify/<name>.html --quality showcase --json
```

*Gotchas:*
- Serve from `public/` — browsers send `Accept: text/html`, which Astro's dev
  router 404s for non-page paths before middleware/routes can respond.
- Keep the JSON and HTML pairs in sync; if you rename, update the catalog mod
  links (see the catalog-mirror rule in AGENTS.md).
- Common showcase failures: label/edge clearance (move labels or shorten
  copy), `desktop-readability` (shorten node sublabels — min 6px projected),
  diagram cycle (MODS/FILES edges must stay outside the PI subgraph).

---

## 5. Run and interpret `npm run check`

The pre-handoff sensor: `astro build` + `astro check` (typecheck) +
`eslint` + `semgrep` (custom rules) + secrets scan + 4 browser behaviour
flows. Self-contained — if no server is running it boots `astro preview` on
the fresh build (port 54321) and shuts it down after.

```bash
set -a; source .env; set +a   # env makes the login flow part of the run
npm run check
```
Expected receipt: `secrets scan: clean` · `qa-flows · http://127.0.0.1:<port>`
with 4 × `✓` and 0 console errors / 0 page errors / 0 failed requests.
Exit 0 = pass.

**Interpreting failures:**

| Failing flow | Likely cause → fix |
|---|---|
| server won't boot | `astro build` failed → fix the compile error printed above |
| typecheck ✗ | `astro check` error with file:line → fix the type error (esbuild strips types — build alone never catches these) |
| eslint ✗ | rule + file:line printed → fix or, if the rule misfires on convention (e.g. Astro files), tune `eslint.config.mjs` minimally |
| semgrep ✗ | rule id + file:line → fix the finding, or amend `.semgrep/rules.yml` if the rule is wrong (rules are earned bars — keep them tight) |
| secrets scan ✗ | file:line + pattern given → move the secret to `.env`, never echo it |
| thin suite / coverage ✗ | seam or unit test failed with file:line → fix the app (or the test, if the seam moved); re-run `npm test` / `npm run coverage` directly before the full check |
| catalog | app/DB broken → check `data/app.db`, run `npm run db:setup` |
| harness | version switcher or mermaid broken → open `/harness`, check browser console via `--eval` |
| archify | static serving broken → confirm the file exists in `public/docs/archify/` (remember the Accept-header lesson) |
| login | env creds unset/mismatch, `AUTH_URL` ≠ serve origin (403), or Secure cookies over http (NODE_ENV) — the self-booted preview sets both correctly |

*Gotchas:*
- Against a running **dev** server, Vite dev-toolbar 504s may appear in the
  console counts (noise) — the self-booted preview is clean.
- Screenshots land in `public/screenshots/check-*.png` (served at
  `/screenshots/…`).