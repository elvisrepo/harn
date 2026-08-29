import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.ts';

function getEnv(name: string, fallback: string): string {
  if (typeof process !== 'undefined' && process.env[name]) return process.env[name]!;
  const mel = (import.meta as any).env;
  if (mel && mel[name]) return mel[name];
  return fallback;
}

const dbPath = getEnv('DATABASE_PATH', 'data/app.db');
if (dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { schema, dbPath };