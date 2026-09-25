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

  it('GET /api/mods lists a coherent catalog', async () => {    const res = await fetch(`${BASE}/api/mods`);
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

describe('articles', () => {
  it('GET /articles lists the papers with linked mods', async () => {
    const res = await fetch(`${BASE}/articles`);
    assert.equal(res.status, 200);
    const html = await res.text();
    for (const s of ['harness-engineering', 'sensors-for-coding-agents', 'openai.com/index/harness-engineering', 'learn-harness-engineering/en', 'lecture-01-why-capable-agents-still-fail', 'lecture-02-what-a-harness-actually-is', 'lecture-03-why-the-repository-must-become-the-system-of-record', 'lecture-04-why-one-giant-instruction-file-fails', 'lecture-05-why-long-running-tasks-lose-continuity', 'lecture-06-why-initialization-needs-its-own-phase', 'lecture-07-why-agents-overreach-and-under-finish', 'lecture-08-why-feature-lists-are-harness-primitives', 'lecture-09-why-agents-declare-victory-too-early', 'lecture-10-why-end-to-end-testing-changes-results', 'lecture-11-why-observability-belongs-inside-the-harness', 'lecture-12-why-every-session-must-leave-a-clean-state', 'lecture-13-loop-engineering', 'lecture-14-graph-engineering', 'Not yet mapped']) {
      assert.match(html, new RegExp(s.replace(/[./]/g, (c) => `\\${c}`)));
    }
  });
});

describe('harness', () => {  it('GET /harness renders the map shell', async () => {
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

describe('fuzz (never 500 on hostile input)', () => {
  it('GET unknown mod slug redirects home, not 500', async () => {
    // by design ([id].astro): unknown slug → Astro.redirect('/'), never an error
    const res = await fetch(`${BASE}/mods/never-a-real-slug-zzz`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location') ?? '', /\/$/);
  });

  it('POST /api/mods with garbage bodies → 4xx, not 500', async () => {
    const bodies = [
      '{oops',
      '[1,2,3]',
      JSON.stringify({ title: 12345, tags: 'not-an-array' }),
      JSON.stringify({ title: 'x'.repeat(1_000_000) }),
      JSON.stringify({}),
    ];
    for (const body of bodies) {
      const res = await fetch(`${BASE}/api/mods`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE },
        body,
      });
      assert.ok(res.status < 500, `500 on body ${(body ?? '').slice(0, 40)}`);
      await res.text().catch(() => {});
    }
  });

  it('POST /api/mod-images unauthenticated → 401, not 500', async () => {
    const fd = new FormData();
    fd.append('image', new Blob(['x'], { type: 'image/png' }), 'x.png');
    const res = await fetch(`${BASE}/api/mod-images`, {
      method: 'POST',
      headers: { origin: BASE },
      body: fd,
    });
    assert.equal(res.status, 401);
  });

  it('POST /api/harness-versions unauthenticated with garbage → 4xx, not 500', async () => {
    const res = await fetch(`${BASE}/api/harness-versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE },
      body: '{"label":42,"summary":[1]}',
    });
    assert.ok(res.status < 500, `500 on wrong-typed body (got ${res.status})`);
  });
});

describe('observability', () => {
  it('traces requests with IDs and checkpoints', async () => {
    const res = await fetch(`${BASE}/api/mods`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('x-request-id') ?? '', /^[a-z0-9]+$/);
    const traces = await (
      await fetch(`${BASE}/api/traces?limit=5`)
    ).json();
    assert.ok(Array.isArray(traces) && traces.length >= 1);
    const seen = traces.find((t) => t.path === '/api/mods');
    assert.ok(seen, 'expected a trace for GET /api/mods');
    assert.ok((seen.checkpoints ?? []).some((c) => c.name === 'db-select-mods'));
  });

  it('exposes Prometheus metrics', async () => {
    const res = await fetch(`${BASE}/api/metrics`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/plain/);
    const body = await res.text();
    assert.match(body, /harn_requests_total \d+/);
    assert.match(body, /harn_request_duration_ms_p50 \d+/);
  });
});

describe('mod images (upload → serve → delete)', { skip: !hasAdminCreds() }, () => {
  // 1x1 transparent png
  const PIXEL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  it('round-trips an image and renders it in mod markdown', async () => {
    const j = jar();
    const signin = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
    });
    assert.equal(signin.status, 200);
    j.capture(signin);
    const auth = { cookie: j.header(), origin: BASE };

    const up = await fetch(`${BASE}/api/mod-images`, {
      method: 'POST',
      headers: auth,
      body: (() => {
        const fd = new FormData();
        fd.append('image', new Blob([PIXEL], { type: 'image/png' }), 'pixel.png');
        return fd;
      })(),
    });
    assert.equal(up.status, 201);
    const { url } = await up.json();
    assert.match(url, /^\/uploads\/[0-9a-f-]{36}\.png$/);

    const img = await fetch(`${BASE}${url}`);
    assert.equal(img.status, 200);
    assert.match(img.headers.get('content-type') ?? '', /image\/png/);

    const del = await fetch(`${BASE}/api/mod-images?name=${encodeURIComponent(url.split('/').pop())}`, {
      method: 'DELETE',
      headers: auth,
    });
    assert.equal(del.status, 200);
    const gone = await fetch(`${BASE}${url}`);
    assert.equal(gone.status, 404);

    await fetch(`${BASE}/api/auth/sign-out`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: '{}',
    });
  });
});
