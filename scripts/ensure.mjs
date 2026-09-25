#!/usr/bin/env node
// Session-start ensure: verify (not rebuild) the standard startup path.
// Clone/wiped-data/schema-change → `npm run db:setup` (rare).
// Every agent session → this (cheap checks, start only what's missing).
// Fails loud; exit 0 means the app is up and verified.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 4321);
const BASE = `http://127.0.0.1:${PORT}`;

const fail = (msg) => {
  console.error(`ensure: FAIL — ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`ensure: ok — ${msg}`);

const get = (url, ms = 5000) =>
  new Promise((resolve) => {
    const req = http.get(url, { timeout: ms }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.on('error', () => resolve(0));
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const status = await get(BASE);
if (status === 200) {
  ok(`server already up at ${BASE} (nothing started)`);
  process.exit(0);
}

// .env first: the server needs AUTH_SECRET to serve anything useful
if (!fs.existsSync('.env')) fail('.env missing — restore the required vars (AUTH_SECRET at minimum)');
const secretLine = fs
  .readFileSync('.env', 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .find((l) => l.startsWith('AUTH_SECRET'));
if (!secretLine || !secretLine.split('=').slice(1).join('=').trim()) {
  fail('AUTH_SECRET unset in .env');
}
ok('.env present with AUTH_SECRET');

if (!fs.existsSync('data/app.db')) {
  ok('data/app.db missing — running db:setup (rare path)');
  try {
    execFileSync('npm', ['run', 'db:setup'], { stdio: 'inherit' });
  } catch {
    fail('db:setup failed');
  }
} else {
  ok('data/app.db present (no reseed — upserts would just churn updatedAt)');
}

console.log(`ensure: starting dev server on ${PORT}…`);
try {
  execFileSync('npx', ['astro', 'dev', '--background', '--port', String(PORT)], { stdio: 'inherit' });
} catch {
  fail('could not start dev server');
}
let up = 0;
for (let i = 0; i < 12 && up !== 200; i++) {
  await sleep(5000);
  up = await get(BASE);
}
if (up !== 200) fail(`server did not answer at ${BASE} after 60s (see: npx astro dev logs)`);
ok(`server up at ${BASE}`);
