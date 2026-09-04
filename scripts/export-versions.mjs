#!/usr/bin/env node
// Export harness_versions (snapshots v1..vN) to a portable, committable JSON —
// so harness history survives cloning to a new machine WITHOUT shipping the
// auth data that lives in data/app.db (password hash, session tokens).
//
// Usage: node scripts/export-versions.mjs [--out <path>]
// Default out: data/harness-versions.json (committed via a .gitignore exception).
//
// Safety note: snapshots embed the harness settings captured at snapshot time
// (provider, model, skills, context estimate). No credentials — auth lives in
// ~/.pi/agent/auth.json and only its *presence* is recorded. Review the diff
// before committing anyway.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 && args[outIdx + 1] ? path.resolve(args[outIdx + 1]) : path.resolve('data', 'harness-versions.json');
const dbPath = path.resolve(process.env.DATABASE_PATH || 'data/app.db');

const db = new Database(dbPath, { readonly: true });
const rows = db
  .prepare('SELECT id, version, label, summary, snapshot, created_at FROM harness_versions ORDER BY version')
  .all();
db.close();

const payload = {
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  count: rows.length,
  versions: rows.map((r) => ({
    id: r.id,
    version: r.version,
    label: r.label,
    summary: r.summary,
    snapshot: JSON.parse(r.snapshot),
    createdAt: r.created_at,
  })),
};

fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
console.log(`exported ${rows.length} version(s) → ${out} (${fs.statSync(out).size} bytes)`);
for (const v of payload.versions) console.log(`  v${v.version} ${v.label}`);