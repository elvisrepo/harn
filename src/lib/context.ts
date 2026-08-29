import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Per-turn context measurement for the current harness.
 *
 * What the model sees each turn ≈ static context (base prompt + tool schemas +
 * skills catalog + <project_context> envelope) + active session branch.
 * Token counts are estimates — the model tokenizer (deepseek-v4-flash) is not
 * available, so we use the chars÷4 rule of thumb; BPE proxies land within
 * roughly ±30%. The durable (append-only) log is reported for reference only.
 */

export interface ContextMeasurement {
  estimator: string;
  /** base system prompt + tool schemas + skills catalog (sampled verbatim) */
  baseTokens: number;
  /** AGENTS.md wrapped in pi's <project_context> envelope + cwd line */
  instructionsTokens: number;
  /** active branch of the session history (root → current leaf) */
  branchTokens: number;
  /** per-turn context estimate: base + instructions + branch */
  totalTokens: number;
  /** full append-only session log — for reference, not what the model sees */
  durableTokens: number;
  branchChars: number;
  staticChars: number;
}

const STATIC_FILE = path.join(process.cwd(), 'data', 'context-static.txt');
const AGENTS_FILE = path.join(process.cwd(), 'AGENTS.md');
const sessionsDir = () => path.join(os.homedir(), '.pi', 'agent', 'sessions');
const projectSessionsDir = () =>
  path.join(
    sessionsDir(),
    `--${process.cwd().replace(/[:\\/]/g, '-')}--`
  );

/** one token ≈ 4 chars (documented rule of thumb; true tokenizer unknown) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** the <project_context> envelope, verbatim format from pi's system-prompt.js */
function projectContextEnvelope(agentsContent: string): string {
  const cwd = process.cwd().replace(/\\/g, '/');
  return `<project_context>

Project-specific instructions and guidelines:

<project_instructions path="${cwd}/AGENTS.md">
${agentsContent}
</project_instructions>

</project_context>
Current working directory: ${cwd}`;
}

function msgText(m: any): string {
  const c = m?.message?.content;
  if (!c) return '';
  if (typeof c === 'string') return c;
  return c.map((p: any) => p.text ?? p.content ?? '').join('\n');
}

/** newest session jsonl → durable text + active branch text (parent-chain walk) */
function readSessionBranch(): { branchText: string; durableText: string } {
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(projectSessionsDir())
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(projectSessionsDir(), f));
  } catch {
    return { branchText: '', durableText: '' };
  }
  if (files.length === 0) return { branchText: '', durableText: '' };
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const events: any[] = [];
  for (const raw of fs.readFileSync(files[0], 'utf8').split('\n')) {
    if (!raw.trim()) continue;
    try {
      events.push(JSON.parse(raw));
    } catch {
      /* skip corrupt lines */
    }
  }
  const byId = new Map(events.map((e) => [e.id, e]));
  const messages = events.filter((e) => e.type === 'message');
  if (messages.length === 0) return { branchText: '', durableText: '' };

  const durableText = messages.map(msgText).join('\n');

  // active branch = parentId chain from the newest message back to root
  // (crosses non-message events like thinking_level_change)
  const chain: string[] = [];
  const seen = new Set<string>();
  let node: any = messages[messages.length - 1];
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    if (node.type === 'message') chain.unshift(msgText(node));
    node = byId.get(node.parentId) ?? null;
  }
  return { branchText: chain.join('\n'), durableText };
}

export function measureContext(): ContextMeasurement {
  const staticText = fs.existsSync(STATIC_FILE) ? fs.readFileSync(STATIC_FILE, 'utf8') : '';
  let agentsContent = '';
  try {
    agentsContent = fs.readFileSync(AGENTS_FILE, 'utf8');
  } catch {
    /* repo file missing — instructions measured as empty */
  }
  const instructionsText = projectContextEnvelope(agentsContent);
  const { branchText, durableText } = readSessionBranch();

  const baseTokens = estimateTokens(staticText);
  const instructionsTokens = estimateTokens(instructionsText);
  const branchTokens = estimateTokens(branchText);

  return {
    estimator: 'chars ÷ 4',
    baseTokens,
    instructionsTokens,
    branchTokens,
    totalTokens: baseTokens + instructionsTokens + branchTokens,
    durableTokens: estimateTokens(durableText),
    branchChars: branchText.length,
    staticChars: staticText.length + instructionsText.length,
  };
}