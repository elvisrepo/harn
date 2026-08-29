import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { desc } from 'drizzle-orm';
import { db, schema } from '../../db/client.ts';
import { measureContext, type ContextMeasurement } from './context.ts';

export interface HarnessSnapshot {
  provider: string;
  model: string;
  settings: Record<string, string>;
  /** provider credential — NEVER store the actual secret, only status */
  authToken: { status: 'present' | 'missing'; source: string; masked: string };
  tools: string[];
  skillsInstalled: number;
  /** design tokens from src/styles/global.css (dark theme block) */
  designTokens: Record<string, string>;
  lightOverrides: boolean;
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

/** Pull the design tokens out of the dark `:root {}` block of global.css */
function readDesignTokens(): { tokens: Record<string, string>; lightOverrides: boolean } {
  const cssPath = path.join(process.cwd(), 'src', 'styles', 'global.css');
  try {
    const css = fs.readFileSync(cssPath, 'utf8');
    const rootMatch = css.match(/:root\s*{([^}]*)}/);
    const tokens: Record<string, string> = {};
    if (rootMatch) {
      for (const m of rootMatch[1].matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
        tokens[m[1]] = m[2].trim();
      }
    }
    const lightOverrides = /prefers-color-scheme:\s*light/.test(css);
    return { tokens, lightOverrides };
  } catch {
    return { tokens: {}, lightOverrides: false };
  }
}

/** Capture the harness state at this moment. Token content is never read — only existence. */
export function buildSnapshot(): HarnessSnapshot {
  const settings = readJsonSafe(path.join(agentDir(), 'settings.json')) ?? {};

  let skillsInstalled = 0;
  try {
    skillsInstalled = fs
      .readdirSync(path.join(agentDir(), 'skills'), { withFileTypes: true })
      .filter((e) => e.isDirectory()).length;
  } catch {
    skillsInstalled = 0;
  }

  const authExists = fs.existsSync(path.join(agentDir(), 'auth.json'));

  const { tokens, lightOverrides } = readDesignTokens();

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
    designTokens: tokens,
    lightOverrides,
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
  return { id, version: next };
}