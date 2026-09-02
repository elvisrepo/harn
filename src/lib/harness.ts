import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { desc } from 'drizzle-orm';
import { db, schema } from '../../db/client.ts';
import { measureContext, type ContextMeasurement } from './context.ts';
import { c4HlLabels, ensureC4Artifact } from './c4.ts';

export interface HarnessSnapshot {
  provider: string;
  model: string;
  settings: Record<string, string>;
  /** provider credential — NEVER store the actual secret, only status */
  authToken: { status: 'present' | 'missing'; source: string; masked: string };
  tools: string[];
  skillsInstalled: number;
  /** installed skill names (grilling, to-spec, …) */
  skills: string[];
  /** per-turn context token estimate (base + instructions + session branch) */
  contextTokens: ContextMeasurement;
  capturedAt: string;
}

export interface HarnessVersionView {
  id: string;
  version: number;
  label: string;
  summary: string;
  createdAt: Date;
  snapshot: HarnessSnapshot;
  isCurrent: boolean;
}

const agentDir = () => path.join(os.homedir(), '.pi', 'agent');
const TOOLS = ['read', 'bash', 'edit', 'write'];

function readJsonSafe(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Capture the harness state at this moment. Token content is never read — only existence. */
export function buildSnapshot(): HarnessSnapshot {
  const settings = readJsonSafe(path.join(agentDir(), 'settings.json')) ?? {};

  let skillsInstalled = 0;
  let skills: string[] = [];
  // user-level (~/.pi/agent/skills) + project-level (<repo>/.pi/skills)
  // NOTE: global skill dirs are often SYMLINKS into ~/.agents/skills — resolve
  // them (isDirectory() is false for symlinks); skip skills disabled in
  // settings.json (“-skills/<name>” entries are installed but not loaded).
  const disabled = new Set(
    ((settings['skills'] as string[] | undefined) ?? [])
      .filter((s) => typeof s === 'string' && s.startsWith('-'))
      .map((s) => (s as string).slice(1).replace(/^skills\//, ''))
  );
  const skillDirs = [path.join(agentDir(), 'skills'), path.join(process.cwd(), '.pi', 'skills')];
  const skillNames = new Set<string>();
  for (const dir of skillDirs) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (disabled.has(e.name)) continue;
        if (e.isDirectory()) skillNames.add(e.name);
        else if (e.isSymbolicLink() && fs.statSync(path.join(dir, e.name)).isDirectory()) skillNames.add(e.name);
      }
    } catch {
      /* dir absent — fine */
    }
  }
  skills = [...skillNames].sort();
  skillsInstalled = skills.length;

  const authExists = fs.existsSync(path.join(agentDir(), 'auth.json'));

  return {
    provider: String(settings.defaultProvider ?? 'unknown'),
    model: String(settings.defaultModel ?? 'unknown'),
    settings: settings as Record<string, string>,
    authToken: {
      status: authExists ? 'present' : 'missing',
      source: '~/.pi/agent/auth.json',
      masked: '•••••••• (masked — never stored)',
    },
    tools: TOOLS,
    skillsInstalled,
    skills,
    contextTokens: measureContext(),
    capturedAt: new Date().toISOString(),
  };
}

export async function listHarnessVersions(): Promise<HarnessVersionView[]> {
  const rows = await db
    .select()
    .from(schema.harnessVersions)
    .orderBy(desc(schema.harnessVersions.version));
  const latest = rows[0]?.version;
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    label: r.label,
    summary: r.summary,
    createdAt: r.createdAt,
    snapshot: JSON.parse(r.snapshot) as HarnessSnapshot,
    isCurrent: r.version === latest,
  }));
}

export async function getHarnessVersion(version: number): Promise<HarnessVersionView | null> {
  const rows = await listHarnessVersions();
  return rows.find((r) => r.version === version) ?? null;
}

export async function createHarnessVersion(label: string, summary: string) {
  const rows = await db.select().from(schema.harnessVersions);
  const next = rows.reduce((m, r) => Math.max(m, r.version), 0) + 1;
  const id = crypto.randomUUID();
  const snapshot = buildSnapshot();
  await db.insert(schema.harnessVersions).values({
    id,
    version: next,
    label: label.trim() || `v${next}`,
    summary: summary.trim() ?? '',
    snapshot: JSON.stringify(snapshot),
    createdAt: new Date(),
  });
  // versioned C4 artifact -> data/c4/v<version>.mmd (regenerated on demand if missing)
  const prevRow = rows.find((r) => r.version === next - 1);
  const prevSnapshot = prevRow ? (JSON.parse(prevRow.snapshot) as HarnessSnapshot) : undefined;
  ensureC4Artifact(next, snapshot, c4HlLabels(prevSnapshot, snapshot));
  return { id, version: next };
}