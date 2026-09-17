#!/usr/bin/env node
// Sensor history timeline (article: effectiveness figure) — reads the
// sidecar's .sensors/history.jsonl and prints per-runner event rows:
// initial / steady / improvement / regression / recovery / worsening.
// Usage: node scripts/sensor-history.mjs [--runner <name>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const histPath = path.join(root, '.sensors', 'history.jsonl');
if (!fs.existsSync(histPath)) {
  console.error('no history yet — start the sidecar (sensors start .) and snapshot (sensors snapshot .)');
  process.exit(2);
}
const onlyIdx = process.argv.indexOf('--runner');
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
const rows = fs
  .readFileSync(histPath, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const prev = {};
const events = [];
for (const row of rows) {
  const ts = (row.timestamp ?? '').slice(5, 16).replace('T', ' ');
  for (const [name, r] of Object.entries(row.runners ?? {})) {
    if (only && name !== only) continue;
    const ok = r.status === 'success';
    const score = r.score?.value ?? 0;
    const p = prev[name];
    let event = 'initial';
    if (p) {
      if (p.ok && ok) event = score === p.score ? 'steady' : score < p.score ? 'improvement' : 'worsening';
      else if (!p.ok && !ok) event = score === p.score ? 'steady' : score < p.score ? 'improvement' : 'worsening';
      else event = ok ? 'recovery' : 'regression';
    }
    events.push({ ts, name, event, ok, score, prevScore: p?.score });
    prev[name] = { ok, score };
  }
}

const htmlIdx = process.argv.indexOf('--html');
if (htmlIdx >= 0) {
  const out = process.argv[htmlIdx + 1] ?? path.join(root, 'public', 'docs', 'sensors', 'history.html');
  const byRunner = {};
  for (const e of events) (byRunner[e.name] ??= []).push(e);
  const maxScore = Math.max(1, ...events.map((e) => Math.max(e.score, e.prevScore ?? 0)));
  const color = (e) => (!e.ok ? '#c14339' : e.event === 'steady' || e.event === 'initial' ? '#2e8b3d' : e.event === 'worsening' ? '#a06a15' : '#1e6fb8');
  const sections = Object.entries(byRunner)
    .map(
      ([name, es]) =>
        `<h2>${name}</h2><table><tr><th>#</th><th>time</th><th>event</th><th>status</th><th>score</th><th></th></tr>` +
        es
          .map((e, i) => {
            const delta = e.prevScore === undefined ? `${e.score}` : `${e.prevScore} → ${e.score}`;
            const w = Math.round((e.score / maxScore) * 280);
            return `<tr><td>${i + 1}</td><td class="mono">${e.ts}</td>` +
              `<td><span class="ev">${e.event}</span></td><td>${e.ok ? 'success' : 'FAILURE'}</td>` +
              `<td class="mono">${delta}</td>` +
              `<td><span class="bar" style="width:${w}px;background:${color(e)}">${e.score}</span></td></tr>`;
          })
          .join('') +
        `</table>`,
    )
    .join('');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sensor history</title>` +
      `<style>body{font-family:system-ui,sans-serif;max-width:1000px;margin:1.5rem auto;padding:0 1rem}` +
      `table{border-collapse:collapse;width:100%;margin-bottom:2rem}td,th{border:1px solid #ccc;padding:.25rem .5rem;text-align:left;font-size:.85rem}` +
      `.mono{font-family:monospace}.ev{border:1px solid #999;border-radius:99px;padding:0 .5rem;font-size:.78rem}` +
      `.bar{display:inline-block;height:14px;color:#fff;font-size:.72rem;min-width:2px}</style></head><body>` +
      `<h1>Sensor history</h1><p>From <code>.sensors/history.jsonl</code> — regenerate with ` +
      `<code>node scripts/sensor-history.mjs --html</code>. Green steady, red failure, blue recovery/improvement, amber worsening.</p>` +
      sections +
      `</body></html>\n`,
  );
  console.log(`wrote ${path.relative(root, out)} (${events.length} events)`);
  process.exit(0);
}

for (const e of events) {
  const delta = e.prevScore === undefined ? ` ${e.score}` : ` ${e.prevScore}→${e.score}`;
  const mark = e.event === 'steady' || e.event === 'initial' ? '·' : e.event === 'regression' || e.event === 'worsening' ? '✗' : '✓';
  console.log(`${e.ts}  ${e.name.padEnd(9)} ${mark} ${e.event.padEnd(11)} ${e.ok ? 'success' : 'FAILURE'}${delta}`);
}
