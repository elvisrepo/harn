import fs from 'node:fs';
import path from 'node:path';

/**
 * Versioned C4 architecture model for the harness.
 *
 * Each harness snapshot gets its own generated mermaid source at
 * data/c4/v<version>.mmd — a faithful artifact of how that version's harness
 * was wired (web-search container present only if that snapshot had a search
 * skill; edges renumbered when the search step is absent). Artifacts are
 * stable once written: backing up/restoring the DB regenerates-on-demand.
 *
 * The palette is baked at generation time from the app's DARK design tokens
 * (src/styles/global.css) — mirrors what the live diagram drew at capture.
 */

export interface C4Palette {
  bg: string;
  surface: string;
  border: string;
  dim: string;
  text: string;
  sky: string;
  accent: string;
  green: string;
  red: string;
  sans: string;
}

/** LIGHT block of src/styles/global.css — canonical palette for artifacts
 *  (light diagram background so the map is readable on any theme). */
export const C4_PALETTE: C4Palette = {
  bg: '#f6f4f0',
  surface: '#ffffff',
  border: '#cfc8ba',
  dim: '#5f6670',
  text: '#1c1e23',
  sky: '#1e6fb8',
  accent: '#a06a15',
  green: '#2e8b3d',
  red: '#c14339',
  sans:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

function parseHex(h: string): number[] {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function tint(p: C4Palette, hex: string, ratio: number): string {
  const fg = parseHex(hex);
  const bgc = parseHex(p.bg);
  const m = fg.map((v, i) => {
    const c = Math.round(bgc[i] + (v - bgc[i]) * ratio);
    return Math.min(255, Math.max(0, c));
  });
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Change labels between two adjacent snapshots — the same rules the harness
 * page uses for its "changed since vN" panel (mirrors diffSnapshot there).
 * Used to decide which diagram elements get the amber highlight in the C4 file.
 */
export function c4HlLabels(prev: any, cur: any): string[] {
  if (!prev) return [];
  const out: string[] = [];
  if (cur.provider !== prev.provider) out.push('provider');
  if (cur.model !== prev.model) out.push('model');
  const tAdd = (cur.tools ?? []).filter((t: string) => !(prev.tools ?? []).includes(t));
  const tRem = (prev.tools ?? []).filter((t: string) => !(cur.tools ?? []).includes(t));
  if (tAdd.length || tRem.length) out.push('tools');
  if (
    cur.skillsInstalled !== prev.skillsInstalled ||
    JSON.stringify(cur.skills ?? []) !== JSON.stringify(prev.skills ?? [])
  )
    out.push('skills');
  if (cur.authToken?.status !== prev.authToken?.status) out.push('credential');
  const ct = cur.contextTokens?.totalTokens;
  const pt = prev.contextTokens?.totalTokens;
  if ((ct && !pt) || (ct && pt && ct !== pt) || (!ct && pt)) out.push('context / turn');
  return out;
}

const NODE_FOR: Record<string, string> = {
  skills: 'WS',
  tools: 'TOOLS',
  model: 'MODEL',
  provider: 'MODEL',
  credential: 'AUTH',
  'context / turn': 'ASM',
};

/**
 * Build the full mermaid graph source for a snapshot.
 * Structure mirrors the original C4 model; MODS/FILES edges sit OUTSIDE the
 * PI subgraph (declaring a subgraph node as its own parent breaks rendering).
 */
export function buildC4Graph(snapshot: any, palette: C4Palette = C4_PALETTE, hlLabels: string[] = []): string {
  const skills: string[] = Array.isArray(snapshot?.skills) ? snapshot.skills : [];
  const skillText = skills.join(' ');
  const hasSearch = /\bfirecrawl\b|\bweb-search\b|\bcode-search\b/.test(skillText);
  const searchTitle = /\bfirecrawl\b/i.test(skillText)
    ? ['Web search · Firecrawl', 'search · scrape · crawl']
    : ['Web search · ketch', 'web-search · code-search · firecrawl backend'];

  const { bg, surface, border, dim, text, sky, accent, green, red, sans } = palette;

  // ---- edges: pipeline inside PI, external (MODS) outside PI —-------------
  type Edge = { a: string; b: string; cate?: string; dashed?: boolean; label: string };
  const inside: Edge[] = [];
  const outside: Edge[] = [];
  let step = 0;
  const add = (list: Edge[], a: string, b: string, suffix: string, o: Partial<Edge> = {}) =>
    list.push({ a, b, label: `${++step} · ${suffix}`, ...o });
  add(inside, 'TUI', 'SESS', 'open session');
  add(inside, 'SESS', 'ASM', 'branch + compaction');
  add(inside, 'CFG', 'ASM', 'config');
  add(inside, 'ASM', 'ORCH', 'per-turn context');
  add(inside, 'ORCH', 'TOOLS', 'invoke tools', { cate: 'tool' });
  add(inside, 'TOOLS', 'ORCH', 'results', { cate: 'tool' });
  if (hasSearch) add(inside, 'ORCH', 'WS', 'research: search/scrape', { cate: 'search' });
  add(inside, 'ORCH', 'MODEL', 'LLM request', { cate: 'model' });
  add(inside, 'AUTH', 'MODEL', 'token', { cate: 'auth' });
  add(inside, 'MODEL', 'MS', 'resolve provider/model', { cate: 'dim', dashed: true });
  add(inside, 'MODEL', 'ORCH', 'reply', { cate: 'model' });
  add(inside, 'ORCH', 'TUI', 'streamed reply');
  add(inside, 'TUI', 'SESS', 'appends JSONL', { dashed: true });
  outside.push({ a: 'MODS', b: 'FILES', label: 'reads · snapshots', cate: 'dim', dashed: true });
  outside.push({ a: 'MODS', b: 'PI', label: 'tracks config + token status', cate: 'dim', dashed: true });

  const line = (e: Edge) => `  ${e.a} ${e.dashed ? '-.->' : '-->'}|${e.label}| ${e.b}`;
  // all edges in declaration order → linkStyle index = array position + 1 (Dev edge sits first)
  const order: Edge[] = [...inside, ...outside];

  const cateColor: Record<string, string> = { tool: green, search: sky, model: sky, auth: red, dim };
  const styleLines: string[] = [];
  for (const [cate, color] of Object.entries(cateColor)) {
    const inds = order.map((e, i) => (e.cate === cate ? i + 1 : 0)).filter(Boolean);
    if (inds.length) styleLines.push(`  linkStyle ${inds.join(',')} stroke:${color},color:${color}`);
  }

  // ---- amber highlights for the version's own change set -------------------
  const hlLines: string[] = [];
  const hlNodeSeen = new Set<string>();
  for (const l of hlLabels) {
    const node = NODE_FOR[l];
    if (node && !hlNodeSeen.has(node)) {
      hlNodeSeen.add(node);
      hlLines.push(`  style ${node} fill:${tint(palette, accent, 0.18)},stroke:${accent},stroke-width:4`);
    }
    if (l === 'skills' || l === 'tools') {
      const targets = order.map((e, i) => (e.cate === 'search' || e.cate === 'tool') ? i + 1 : 0).filter(Boolean);
      if (targets.length && !hlLines.some((x) => x.startsWith('  linkStyle') && x.includes('stroke:' + accent)))
        hlLines.push(`  linkStyle ${targets.join(',')} stroke:${accent},color:${accent},stroke-width:3`);
    }
  }

  const wsNode = hasSearch
    ? `      WS["🔎 ${searchTitle[0]}<br/>${searchTitle[1]}"]:::container\n`
    : '';

  return `flowchart TB
  Dev["👤 Developer (you)<br/>leads the session"]:::person
  Dev -->|uses| PI
  subgraph PI["pi coding agent · v0.84.4"]
    direction TB
    subgraph LOAD["1 · LOAD — session + config"]
      direction LR
      TUI["▣ pi CLI · TUI<br/>terminal · manages sessions"]:::container
      SESS["⎙ Session history<br/>append-only JSONL · parent pointers"]:::container
      CFG["▤ Config & state<br/>settings.json · trust.json"]:::container
    end
    subgraph COMPOSE["2 · COMPOSE — per-turn context"]
      direction LR
      ASM["⎘ Context assembler<br/>base prompt · project instructions<br/>skills catalog · extension hooks"]:::container
    end
    subgraph LOOP["3 · AGENT LOOP — tools${hasSearch ? ' · web' : ''} · model"]
      direction LR
      ORCH["◎ Agent orchestration<br/>the core loop"]:::container
      TOOLS["⚙ Tools<br/>read · bash · edit · write"]:::container
${wsNode}      MODEL["◈ Model provider<br/>routes prompts to an LLM"]:::container
      AUTH["🔑 Auth / credentials<br/>token on every prompt"]:::container
      MS["🗎 models-store.json<br/>provider/model catalog"]:::file
    end
${inside.map(line).join('\n')}
  end
  MODS["▦ Harness Mods (web app)<br/>catalog + admin · snapshots · map"]:::system
  FILES["▤ Harness files<br/>settings · auth (presence) · tokens"]:::system
${outside.map(line).join('\n')}
  classDef person fill:${tint(palette, sky, 0.16)},stroke:${sky},stroke-width:2
  classDef system fill:${tint(palette, accent, 0.15)},stroke:${accent},stroke-width:2
  classDef container fill:${tint(palette, green, 0.12)},stroke:${green},stroke-width:2
  classDef file fill:${surface},stroke:${border},stroke-width:1.5
  style LOAD fill:${tint(palette, sky, 0.05)},stroke:${sky},stroke-width:2
  style COMPOSE fill:${tint(palette, accent, 0.05)},stroke:${accent},stroke-width:2
  style LOOP fill:${tint(palette, green, 0.05)},stroke:${green},stroke-width:2
  style PI fill:${tint(palette, border, 0.1)},stroke:${border},stroke-width:2
${styleLines.join('\n')}
${hlLines.join('\n')}
`;
}

/** data/c4/v<version>.mmd — committed-able mermaid artifact per snapshot */
export function c4ArtifactPath(version: number): string {
  return path.join(process.cwd(), 'data', 'c4', `v${version}.mmd`);
}

/** Write the artifact if missing; returns its path. */
export function ensureC4Artifact(version: number, snapshot: any, hlLabels: string[]): string {
  const p = c4ArtifactPath(version);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buildC4Graph(snapshot, C4_PALETTE, hlLabels));
  }
  return p;
}

/** Load (generating + persisting on first request) the mermaid source for a version. */
export function loadC4Graph(version: number, snapshot: any, hlLabels: string[]): string {
  ensureC4Artifact(version, snapshot, hlLabels);
  return fs.readFileSync(c4ArtifactPath(version), 'utf8');
}