// Shared dev/preview boot — single source for scripts/qa-flows.mjs and the
// thin suite (test/helpers.mjs), which duplicated this logic verbatim
// (modularity-review finding: same idea under two names).
// Reuse APP_URL-or-default when reachable, else boot astro preview on the
// given port; cleanup() reaps via `preview stop` (astro daemonizes, so
// spawner-kill alone leaks the server).
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function astroBin() {
  return path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'astro.cmd' : 'astro');
}

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ensureServer({ base, port }) {
  if (await reachable(`${base}/`)) return { base, cleanup: async () => {} };
  const url = `http://127.0.0.1:${port}`;
  if (await reachable(`${url}/`)) return { base: url, cleanup: async () => {} };
  const child = spawn(astroBin(), ['preview', '--port', String(port), '--host', '127.0.0.1'], {
    cwd: root,
    stdio: 'ignore',
    // local http + matching origin: avoid secure cookies and better-auth origin rejection
    env: { ...process.env, NODE_ENV: 'development', AUTH_URL: url },
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await reachable(`${url}/`)) {
      return {
        base: url,
        cleanup: async () => {
          child.kill();
          spawnSync(astroBin(), ['preview', 'stop'], { stdio: 'ignore' });
          await sleep(500);
        },
      };
    }
    await sleep(400);
  }
  child.kill();
  throw new Error(`app not reachable at ${url} (and astro preview failed to boot)`);
}
