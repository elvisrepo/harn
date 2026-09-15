// Shared harness for the thin suite — same server conventions as
// scripts/qa-flows.mjs: honour APP_URL (default http://127.0.0.1:4321),
// else self-boot `astro preview` (dist/ is built before `check` runs us).
// Local-only, no new dependencies (node:test + global fetch).
// Shared harness for the thin suite — server boot delegated to
// scripts/boot-preview.mjs (single source; was duplicated with qa-flows).
// Honours APP_URL (default http://127.0.0.1:4321); self-boots preview
// (dist/ is built before `check` runs us). Local-only, no new dependencies.
import { ensureServer } from '../scripts/boot-preview.mjs';

const BOOT_PORT = 54322;
let base = process.env.APP_URL || 'http://127.0.0.1:4321';
let cleanup = async () => {};

/** Base URL of a running app, booting preview if needed. Idempotent per process. */
export async function appUrl() {
  const r = await ensureServer({ base, port: BOOT_PORT });
  base = r.base;
  cleanup = r.cleanup;
  return base;
}

export async function closeApp() {
  await cleanup();
  cleanup = async () => {};
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
