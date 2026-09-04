#!/usr/bin/env node
// Behaviour + smoke sensor for the harness app (article: "keep quality left").
// Runs browser-qa flows against the app, aggregates machine-readable receipts,
// exits non-zero if any flow failed. Expects the app to be reachable
// (dev server or preview) at APP_URL (default http://127.0.0.1:4321).
//
// Usage: node scripts/qa-flows.mjs [--json]
//   - catalog  /                                     main + title present
//   - harness  /harness?v=<latest>                   version switcher + mermaid diagram
//   - archify  /docs/archify/harness-mods.architecture.html   svg present (same-origin)
//   - login    /login --login -> /admin              only when ADMIN_EMAIL/ADMIN_PASSWORD env set
//
// Screenshots land in public/screenshots/ per flow.

import { spawnSync, spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QA = path.join(root, '.pi', 'skills', 'browser-qa', 'scripts', 'qa.mjs');
let BASE = process.env.APP_URL || 'http://127.0.0.1:4321';
const SHOT_DIR = path.join(root, 'public', 'screenshots');

function reachable(url, ms = 1000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined);
    });
    req.setTimeout(ms, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function ensureApp() {
  if (await reachable(BASE)) return null; // reuse the running app (dev/preview)
  // no server: build artifact was produced by `check` — serve it via astro preview
  const port = 54321;
  BASE = `http://127.0.0.1:${port}`;
  const astro = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'astro.cmd' : 'astro');
  const child = spawn(astro, ['preview', '--port', String(port), '--host', '127.0.0.1'], {
    cwd: root,
    stdio: 'ignore',
    detached: false,
    // local http + matching origin: avoid secure cookies and better-auth origin rejection
    env: { ...process.env, NODE_ENV: 'development', AUTH_URL: BASE },
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await reachable(`${BASE}/`)) return child;
    await new Promise((r) => setTimeout(r, 400));
  }
  child.kill();
  throw new Error(`app not reachable at ${BASE} (and astro preview failed to boot)`);
}

const flows = [
  { name: 'catalog', path: '/', args: ['--assert', 'main', '--text', 'Harness Mods', '--shot', path.join(SHOT_DIR, 'check-catalog.png')] },
  { name: 'harness', path: '/harness', args: ['--assert', '.ver-switch .vs-item', '--assert', '#harness-mermaid', '--eval', 'document.querySelectorAll("#harness-mermaid svg").length', '--shot', path.join(SHOT_DIR, 'check-harness.png')] },
  { name: 'archify', path: '/docs/archify/harness-mods.architecture.html', args: ['--assert', 'svg', '--shot', path.join(SHOT_DIR, 'check-archify.png')] },
];
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  flows.push({ name: 'login', path: '/login', args: ['--login', '--assert', 'h1', '--shot', path.join(SHOT_DIR, 'check-login.png')] });
}

const results = [];
let previewChild = null;
try {
  previewChild = await ensureApp();
  for (const f of flows) {
    const r = spawnSync(process.execPath, [QA, `${BASE}${f.path}`, ...f.args, '--json'], { encoding: 'utf8' });
    let report = null;
    try { report = JSON.parse(r.stdout); } catch { /* structured error below */ }
    results.push({
      name: f.name,
      ok: r.status === 0 && report?.ok === true,
      status: r.status,
      details: report
        ? { summary: report.summary, eval: report.eval?.result, errors: report.reportError }
        : { raw: (r.stderr || r.stdout || '').slice(0, 200) },
    });
  }
} finally {
  if (previewChild) {
    previewChild.kill();
    await new Promise((r) => setTimeout(r, 300));
  }
}

const useJson = process.argv.includes('--json');
if (useJson) {
  console.log(JSON.stringify({ base: BASE, flows: results, ok: results.every((r) => r.ok) }, null, 2));
} else {
  console.log(`qa-flows · ${BASE}`);
  for (const r of results) {
    const s = r.details?.summary ?? {};
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}  (asserts ${s.failedAssertions ?? '-'} failed · console ${s.consoleErrors ?? '-'} err · pageErrs ${s.pageErrors ?? '-'} · reqFail ${s.failedRequests ?? '-'})${r.details?.eval ? ` · eval=${r.details.eval}` : ''}${r.details?.errors ? ` · ${r.details.errors}` : ''}`);
  }
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.log('  (login flow skipped — set ADMIN_EMAIL/ADMIN_PASSWORD env to include it)');
  }
}
process.exit(results.every((r) => r.ok) ? 0 : 1);