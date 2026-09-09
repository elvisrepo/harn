// Shared harness for the thin suite — same server conventions as
// scripts/qa-flows.mjs: honour APP_URL (default http://127.0.0.1:4321),
// else self-boot `astro preview` (dist/ is built before `check` runs us).
// Local-only, no new dependencies (node:test + global fetch).
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function astroBin() {
  return path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'astro.cmd' : 'astro');
}
const BOOT_PORT = 54322;
let base = process.env.APP_URL || 'http://127.0.0.1:4321';
let child = null;

function reachable(url, ms = 1000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined);
    });
    req.setTimeout(ms, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

/** Base URL of a running app, booting preview if needed. Idempotent per process. */
export async function appUrl() {
  if (await reachable(`${base}/`)) return base;
  base = `http://127.0.0.1:${BOOT_PORT}`;
  if (await reachable(`${base}/`)) return base;
  const astro = astroBin();
  child = spawn(astro, ['preview', '--port', String(BOOT_PORT), '--host', '127.0.0.1'], {
    cwd: root,
    stdio: 'ignore',
    // local http + matching origin: avoid secure cookies and better-auth origin rejection
    env: { ...process.env, NODE_ENV: 'development', AUTH_URL: base },
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await reachable(`${base}/`)) return base;
    await new Promise((r) => setTimeout(r, 400));
  }
  child.kill();
  child = null;
  throw new Error(`app not reachable at ${base} (and astro preview failed to boot)`);
}

export async function closeApp() {
  if (child) {
    child.kill();
    child = null;
    // astro preview daemonizes — SIGTERM to the spawner is not enough;
    // `preview stop` reaps the managed daemon (it is ours: we only boot
    // when nothing answered, and astro runs a single preview server)
    spawnSync(astroBin(), ['preview', 'stop'], { stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Minimal cookie jar: captures set-cookie, replays Cookie (never logs values). */
export function jar() {
  let cookies = [];
  return {
    capture(res) {
      const set = res.headers.getSetCookie?.() ?? [];
      for (const c of set) cookies.push(c.split(';')[0]);
    },
    header() {
      return cookies.join('; ');
    },
    clear() {
      cookies = [];
    },
  };
}

export const hasAdminCreds = () => Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
