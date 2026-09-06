#!/usr/bin/env node
// Secrets sensor (article: "positive prompt injection" — a rule graduated into
// a computational check whose failure message carries the fix).
// Scans git-tracked files for credential-shaped strings; fails with
// file:line + pattern name (the secret VALUE is never printed).
//
// Usage: node scripts/check-secrets.mjs
// Exit: 0 clean · 1 findings · 2 error. Wired into `npm run check`.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// pattern name → regex (tune to this repo's credential shapes; keep tight to avoid noise)
const PATTERNS = [
  ['private key block', /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['Firecrawl API key', /\bfc-[0-9a-f]{20,}\b/i],
  ['env-style assignment', /\b(AUTH_SECRET|ADMIN_PASSWORD|FIRECRAWL_API_KEY)\s*=\s*\S+/],
];

let tracked;
try {
  tracked = execSync('git ls-files', { encoding: 'utf8', cwd: process.cwd() })
    .split('\n').map((s) => s.trim()).filter(Boolean);
} catch (e) {
  console.error('not a git worktree? cannot enumerate tracked files:', String(e).slice(0, 120));
  process.exit(2);
}

const SELF = path.relative(process.cwd(), path.join('scripts', 'check-secrets.mjs'));
const findings = [];
let scanned = 0;

for (const rel of tracked) {
  if (rel === SELF) continue; // don't flag the scanner's own pattern table
  let buf;
  try { buf = fs.readFileSync(path.resolve(rel)); } catch { continue; }
  if (buf.includes(0)) continue; // binary
  const text = buf.toString('utf8');
  scanned += 1;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const [name, re] of PATTERNS) {
      if (re.test(lines[i])) {
        findings.push({ file: rel, line: i + 1, pattern: name });
      }
    }
  }
}

if (findings.length === 0) {
  console.log(`secrets scan: clean (${scanned} tracked files, ${PATTERNS.length} patterns)`);
  process.exit(0);
}

console.log(`secrets scan: ${findings.length} finding(s) — move the secret to .env (gitignored) and reference via process.env; never echo the value:`);
for (const f of findings) console.log(`  ✗ ${f.file}:${f.line} — ${f.pattern}`);
process.exit(1);