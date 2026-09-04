#!/usr/bin/env node
// Import harness_versions from the portable JSON (scripts/export-versions.mjs).
// Honors "no silent history rewrites": by default only versions MISSING locally
// are inserted; existing version numbers are skipped and reported. Pass --force
// to overwrite existing rows (e.g. the placeholder v1 a fresh `db:seed` creates).
//
// Usage: node scripts/import-versions.mjs [--in <path>] [--force]
// Default in: data/harness-versions.json.
// Only harness_versions is touched — users/sessions/mods are left alone.
// C4 artifacts (data/c4/v<n>.mmd) regenerate lazily on first view.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const inIdx = args.indexOf('--in');
const file = inIdx >= 0 && args[inIdx + 1] ? path.resolve(args[inIdx + 1]) : path.resolve('data', 'harness-versions.json');
const force = args.includes('--force');
const dbPath = path.resolve(process.env.DATABASE_PATH || 'data/app.db');

if (!fs.existsSync(file)) {
  console.error(`import file not found: ${file}`);
  process.exit(2);
}
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const versions = payload.versions ?? [];
if (!Array.isArray(versions) || versions.length === 0) {
  console.error('no versions in payload');
  process.exit(2);
}

const db = new Database(dbPath);
const exists = db.prepare('SELECT snapshot FROM harness_versions WHERE version = ?');
const insert = db.prepare(
  'INSERT INTO harness_versions (id, version, label, summary, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const update = db.prepare(
  'UPDATE harness_versions SET label = ?, summary = ?, snapshot = ?, created_at = ? WHERE version = ?'
);

let inserted = 0;
let updated = 0;
let skipped = 0;
for (const v of versions) {
  const snapshot = JSON.stringify(v.snapshot);
  const existing = exists.get(v.version);
  if (existing) {
    if (force) {
      update.run(v.label, v.summary, snapshot, v.createdAt, v.version);
      updated += 1;
      console.log(`  v${v.version} updated (force): ${v.label}`);
    } else {
      skipped += 1;
      console.log(`  v${v.version} skipped (exists; --force to overwrite): ${v.label}`);
    }
  } else {
    insert.run(v.id, v.version, v.label, v.summary, snapshot, v.createdAt);
    inserted += 1;
    console.log(`  v${v.version} inserted: ${v.label}`);
  }
}

console.log(`import from ${file} → ${dbPath}: ${inserted} inserted · ${updated} updated · ${skipped} skipped`);
db.close();
process.exit(0);