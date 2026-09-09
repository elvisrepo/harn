// Thin runnable suite: computational mirror of the 4 browser qa-flows
// (catalog · harness · archify · login) — no browser, pure HTTP + JSON.
// Run: npm test (BASE: APP_URL or self-booted preview). Login write-paths
// run only with ADMIN_EMAIL/ADMIN_PASSWORD env set, and sign out after.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { appUrl, closeApp, jar, hasAdminCreds } from './helpers.mjs';

let BASE;
before(async () => {
  BASE = await appUrl();
});
after(closeApp);

const json = (res) => res.json();

describe('catalog', () => {
  it('GET / renders the catalog', async () => {
    const res = await fetch(`${BASE}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await res.text(), /Harness Mods/);
  });

  it('GET /api/mods lists a coherent catalog', async () => {
    const res = await fetch(`${BASE}/api/mods`);
    assert.equal(res.status, 200);
    const mods = await json(res);
    assert.ok(Array.isArray(mods) && mods.length >= 20, `expected 20+ mods, got ${mods.length}`);
    for (const m of mods) {
      assert.ok(m.slug && m.title, `mod missing slug/title: ${JSON.stringify(m).slice(0, 80)}`);
    }
    const slugs = mods.map((m) => m.slug);
    assert.equal(new Set(slugs).size, slugs.length, 'duplicate slugs');
    for (const s of ['clis-scripts', 'code-mods']) {
      assert.ok(slugs.includes(s), `seed wiring missing: ${s}`);
    }
  });
});

describe('harness', () => {
  it('GET /harness renders the map shell', async () => {
    const res = await fetch(`${BASE}/harness`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /harness-mermaid/);
    assert.match(html, /lsp-diagnostics/, 'map should show the LSP client (v9+)');
  });

  it('GET /api/harness-versions is a contiguous history with sound snapshots', async () => {
    const res = await fetch(`${BASE}/api/harness-versions`);
    assert.equal(res.status, 200);
    const versions = await json(res);
    assert.ok(versions.length >= 1);
    const nums = versions.map((v) => v.version).sort((a, b) => a - b);
    assert.deepEqual(nums, Array.from({ length: nums.length }, (_, i) => i + 1), 'versions must be 1..N contiguous');
    const latest = versions.find((v) => v.version === nums.length);
    for (const k of ['provider', 'model', 'skills', 'authToken']) {
      assert.ok(latest.snapshot?.[k] !== undefined, `latest snapshot missing ${k}`);
    }
    assert.ok(['present', 'missing'].includes(latest.snapshot.authToken.status));
  });
});

describe('archify', () => {
  const target = '/docs/archify/harness-mods.architecture.html';
  it('serves real browsers (Accept: text/html)', async () => {
    const res = await fetch(`${BASE}${target}`, { headers: { accept: 'text/html' } });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<!doctype html>/i);
  });

  it('serves scripted clients too (Accept: */*)', async () => {
    // earned: curl got 200 while browsers got Astro's 404 — both must pass
    const res = await fetch(`${BASE}${target}`, { headers: { accept: '*/*' } });
    assert.equal(res.status, 200);
  });
});

describe('login', () => {
  it('GET /admin without a session redirects to /login', async () => {
    const res = await fetch(`${BASE}/admin`, { redirect: 'manual' });
    assert.ok([301, 302, 303, 307, 308].includes(res.status), `expected redirect, got ${res.status}`);
    assert.match(res.headers.get('location') ?? '', /\/login/);
  });

  it('POST sign-in rejects wrong credentials', async () => {
    const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      // undici sends sec-fetch-* like a browser → better-auth enforces Origin;
      // real browser fetches attach it, so must we (AUTH_URL discipline)
      headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-wrong-wrong' }),
    });
    assert.ok(res.status >= 400, `expected 4xx, got ${res.status}`);
  });

  it('POST sign-in accepts the admin, guards /admin, and signs out', { skip: !hasAdminCreds() }, async () => {
    const j = jar();
    const signin = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
    });
    assert.equal(signin.status, 200);
    j.capture(signin);
    assert.ok(j.header().length > 0, 'expected a session cookie');

    const admin = await fetch(`${BASE}/admin`, { headers: { cookie: j.header() } });
    assert.equal(admin.status, 200);

    const signout = await fetch(`${BASE}/api/auth/sign-out`, {
      method: 'POST',
      headers: { cookie: j.header(), origin: BASE, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.ok(signout.ok, `sign-out failed: ${signout.status}`);

    const after = await fetch(`${BASE}/admin`, {
      headers: { cookie: j.header() },
      redirect: 'manual',
    });
    assert.ok([301, 302, 303, 307, 308].includes(after.status), 'session should be dead after sign-out');
  });
});
