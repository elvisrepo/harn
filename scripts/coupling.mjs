#!/usr/bin/env node
// Coupling analyser (article: coupling-data experiment) — per-file import +
// call edges via the TypeScript compiler, for agent (CLI/JSON) and human
// (static html report) consumption. ts/js/mjs/cjs only: .astro frontmatter
// is unparseable, same blindness as dependency-cruiser (stated, not hidden).
//
// Usage:
//   node scripts/coupling.mjs                   full JSON to stdout
//   node scripts/coupling.mjs hotspots [--top N]
//   node scripts/coupling.mjs impact <file...>   transitive importers+callers (review triage)
//   node scripts/coupling.mjs cycles
//   node scripts/coupling.mjs html [out.html]   static report page
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['src', 'db', 'scripts', 'test', '.pi'];
const EXT = /\.(ts|js|mjs|cjs)$/;

function collect(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'data', '.astro', 'coverage'].includes(e.name)) continue;
      out.push(...collect(full));
    } else if (EXT.test(full)) {
      out.push(full);
    }
  }
  return out;
}

const files = DIRS.flatMap((d) => collect(path.join(root, d)));
const program = ts.createProgram(files, {
  allowJs: true,
  checkJs: false,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
});
const checker = program.getTypeChecker();
const rel = (f) => path.relative(root, path.normalize(f));
const inRepo = (f) => {
  const r = rel(f);
  return r && !r.startsWith('..') && !r.includes('node_modules');
};

const imports = new Map(); // file -> Set<file>
const calls = new Map(); // caller -> Map<callee, count>
const funcs = new Map(); // file -> Map<funcName, callsIn>
const addEdge = (m, a, b, n = 1) => {
  if (!m.has(a)) m.set(a, new Map());
  m.get(a).set(b, (m.get(a).get(b) ?? 0) + n);
};
// top-level function-like declarations in a source file -> [name]
function topFunctions(sf) {
  const out = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) out.push(st.name.text);
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (d.name && ts.isIdentifier(d.name) && d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          out.push(d.name.text);
        }
      }
    } else if (ts.isClassDeclaration(st) && st.name) {
      for (const m of st.members) {
        if ((ts.isMethodDeclaration(m) || ts.isGetAccessor(m) || ts.isSetAccessor(m)) && m.name && ts.isIdentifier(m.name)) {
          out.push(`${st.name.text}.${m.name.text}`);
        }
      }
    }
  }
  return out;
}

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !inRepo(sf.fileName)) continue;
  const me = rel(sf.fileName);
  const fileImports = new Set();
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const r = ts.resolveModuleName(node.moduleSpecifier.text, sf.fileName, program.getCompilerOptions(), ts.sys);
      const f = r.resolvedModule?.resolvedFileName;
      if (f && inRepo(f) && rel(f) !== me) fileImports.add(rel(f));
    }
    if (ts.isCallExpression(node)) {
      try {
        const sig = checker.getResolvedSignature(node);
        const decl = sig?.declaration;
        const f = decl?.getSourceFile()?.fileName;
        if (f && inRepo(f) && rel(f) !== me) addEdge(calls, me, rel(f));
      } catch {
        /* unresolvable callee — skip */
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  imports.set(me, fileImports);
  funcs.set(me, new Map(topFunctions(sf).map((n) => [n, 0])));
}

// attribute resolved calls to (file, function) for the Functions tab
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || !inRepo(sf.fileName)) continue;
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      try {
        const decl = checker.getResolvedSignature(node)?.declaration;
        const f = decl?.getSourceFile()?.fileName;
        if (f && inRepo(f)) {
          let name = decl.name && ts.isIdentifier(decl.name) ? decl.name.text : null;
          if (!name && decl.parent && ts.isVariableDeclaration(decl.parent) && ts.isIdentifier(decl.parent.name)) {
            name = decl.parent.name.text;
          }
          const fm = funcs.get(rel(f));
          if (fm && name && fm.has(name)) fm.set(name, fm.get(name) + 1);
        }
      } catch {
        /* skip */
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const importedBy = new Map();
for (const [a, set] of imports) for (const b of set) addEdge(importedBy, b, a);
const calledBy = new Map();
for (const [a, m] of calls) for (const [b, n] of m) addEdge(calledBy, b, a, n);

const fanIn = (f) => (importedBy.get(f)?.size ?? 0) + (calledBy.get(f)?.size ?? 0);
const fanOut = (f) => (imports.get(f)?.size ?? 0) + (calls.get(f)?.size ?? 0);
const allFiles = [...new Set([...imports.keys(), ...calls.keys()])].sort();

const data = {
  files: Object.fromEntries(
    allFiles.map((f) => [
      f,
      {
        imports: [...(imports.get(f) ?? [])].sort(),
        importedBy: [...(importedBy.get(f) ?? []).keys()].sort(),
        callsOut: Object.fromEntries([...(calls.get(f) ?? [])].sort()),
        callsIn: Object.fromEntries([...(calledBy.get(f) ?? [])].sort()),
        fanIn: fanIn(f),
        fanOut: fanOut(f),
      },
    ]),
  ),
};

function findCycles() {
  const cycles = [];
  const stack = [];
  const onStack = new Set();
  const done = new Set();
  const dfs = (n) => {
    if (onStack.has(n)) {
      cycles.push([...stack.slice(stack.indexOf(n)), n]);
      return;
    }
    if (done.has(n)) return;
    onStack.add(n);
    stack.push(n);
    for (const m of imports.get(n) ?? []) dfs(m);
    stack.pop();
    onStack.delete(n);
    done.add(n);
  };
  for (const f of allFiles) dfs(f);
  return cycles;
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'json') {
  console.log(JSON.stringify(data, null, 1));
} else if (cmd === 'hotspots') {
  const topIdx = rest.indexOf('--top');
  const top = topIdx >= 0 ? Number(rest[topIdx + 1]) || 10 : 10;
  const byIn = [...allFiles].sort((a, b) => fanIn(b) - fanIn(a)).slice(0, top);
  const byOut = [...allFiles].sort((a, b) => fanOut(b) - fanOut(a)).slice(0, top);
  console.log(`top ${top} fan-in (dependents — look hard when these change):`);
  for (const f of byIn) console.log(`  ${String(fanIn(f)).padStart(2)}  ${f}`);
  console.log(`top ${top} fan-out (dependencies — breakage surface):`);
  for (const f of byOut) console.log(`  ${String(fanOut(f)).padStart(2)}  ${f}`);
} else if (cmd === 'impact') {
  if (!rest.length) {
    console.error('usage: coupling.mjs impact <file...>');
    process.exit(2);
  }
  const seen = new Set();
  const queue = rest.map((r) => path.normalize(r));
  while (queue.length) {
    const f = queue.shift();
    for (const dep of [...(importedBy.get(f) ?? []).keys(), ...(calledBy.get(f) ?? []).keys()]) {
      if (!seen.has(dep) && !rest.includes(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  console.log(`blast radius of ${rest.join(', ')} (${seen.size} file(s) transitively reach in):`);
  for (const f of [...seen].sort()) console.log(`  ${f}`);
} else if (cmd === 'cycles') {
  const cycles = findCycles();
  if (!cycles.length) console.log('no import cycles');
  else for (const c of cycles) console.log(`cycle: ${c.join(' -> ')}`);
} else if (cmd === 'html') {
  const out = rest[0] ?? path.join(root, 'public', 'docs', 'coupling', 'report.html');
  const rows = [...allFiles]
    .sort((a, b) => fanIn(b) - fanIn(a) || fanOut(b) - fanOut(a))
    .map(
      (f) =>
        `<tr><td><code>${f}</code></td><td>${fanIn(f)}</td><td>${fanOut(f)}</td>` +
        `<td>${[...(importedBy.get(f) ?? []).keys()].join(', ') || '—'}</td>` +
        `<td>${[...(imports.get(f) ?? [])].join(', ') || '—'}</td></tr>`,
    )
    .join('\n');
  const cyc = findCycles();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Coupling report</title>` +
      `<style>body{font-family:system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem}` +
      `table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.3rem .5rem;text-align:left}` +
      `code{font-size:.85em}</style></head><body>` +
      `<h1>Coupling report</h1><p>Fan-in = dependents (look hard when these change). Fan-out = dependencies. ` +
      `Generated by <code>node scripts/coupling.mjs html</code>; .astro files invisible (stated blind spot).</p>` +
      `<h2>Cycles: ${cyc.length ? cyc.map((c) => c.join(' → ')).join('; ') : 'none'}</h2>` +
      `<table><tr><th>file</th><th>fan-in</th><th>fan-out</th><th>imported by</th><th>imports</th></tr>${rows}</table>` +
      `</body></html>\n`,
  );
  console.log(`wrote ${path.relative(root, out)} (${allFiles.length} files)`);
} else if (cmd === 'dashboard') {
  const out = rest[0] ?? path.join(root, 'public', 'docs', 'coupling', 'dashboard.html');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const folders = {};
  for (const f of allFiles) {
    const dir = path.dirname(f);
    (folders[dir] ??= { files: [], internal: 0, external: 0 });
    folders[dir].files.push(f);
  }
  for (const [a, m] of calls) {
    for (const [b, n] of m) {
      const same = path.dirname(a) === path.dirname(b);
      folders[path.dirname(a)].internal += same ? n : 0;
      folders[path.dirname(a)].external += same ? 0 : n;
    }
  }
  // 01 Structure: columns by layer, straight import edges
  const layerOf = (f) =>
    f.startsWith('src/pages') ? 0 : f.startsWith('src/lib') ? 1 : f.startsWith('db') ? 2
    : f.startsWith('scripts') ? 3 : f.startsWith('test') ? 4 : f.startsWith('.pi') ? 5 : 1;
  const layerNames = ['routes', 'lib', 'db', 'scripts', 'test', 'ext'];
  const cols = [[], [], [], [], [], []];
  for (const f of allFiles) cols[layerOf(f)].push(f);
  const pos = {};
  cols.forEach((col, ci) => col.forEach((f, ri) => (pos[f] = [ci * 175 + 90, ri * 32 + 44])));
  const H = Math.max(...cols.map((c) => c.length)) * 32 + 60;
  let edges = '';
  for (const [a, set] of imports) {
    for (const b of set) {
      if (!pos[a] || !pos[b]) continue;
      const [x1, y1] = pos[a];
      const [x2, y2] = pos[b];
      edges += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7aa7c7" stroke-width="1"/>`;
    }
  }
  let nodes = '';
  cols.forEach((col, ci) => {
    nodes += `<text x="${ci * 175 + 90}" y="16" text-anchor="middle" font-weight="bold">${layerNames[ci]}</text>`;
    for (const f of col) {
      const [x, y] = pos[f];
      const label = f.split('/').pop();
      nodes += `<rect x="${x - 78}" y="${y - 12}" width="156" height="22" rx="4" fill="#eaf3f8" stroke="#7aa7c7"/>` +
        `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10">${esc(label)}</text>`;
    }
  });
  const structure = `<svg viewBox="0 0 1090 ${H}" width="100%"><rect width="1090" height="${H}" fill="#fff"/>${edges}${nodes}</svg>`;
  // 02 Coupling: fan bars
  const bar = (label, a, b, maxA, maxB) =>
    `<div class="brow"><span class="blab"><code>${esc(label)}</code></span>` +
    `<span class="bbar"><span class="fi" style="width:${(a / maxA) * 100}px"></span></span><span class="bn">${a}</span>` +
    `<span class="bbar"><span class="fo" style="width:${(b / maxB) * 100}px"></span></span><span class="bn">${b}</span></div>`;
  const maxI = Math.max(...allFiles.map(fanIn), 1);
  const maxO = Math.max(...allFiles.map(fanOut), 1);
  const coupling =
    `<div class="bhead"><span class="blab"></span><span>fan-in (dependents)</span><span></span><span>fan-out</span><span></span></div>` +
    [...allFiles].sort((a, b) => fanIn(b) - fanIn(a) || fanOut(b) - fanOut(a)).map((f) => bar(f, fanIn(f), fanOut(f), maxI, maxO)).join('');
  // 03 Cohesion: internal-call share per folder
  const cohesion = Object.entries(folders)
    .sort()
    .map(([d, g]) => {
      const tot = g.internal + g.external;
      const pct = tot ? Math.round((g.internal / tot) * 100) : 100;
      return `<div class="brow"><span class="blab"><code>${esc(d)}</code></span>` +
        `<span class="bbar big"><span class="fi" style="width:${pct * 2}px"></span></span>` +
        `<span class="bn">${tot ? pct + '%' : 'n/a'} (${g.files.length} files)</span></div>`;
    })
    .join('');
  // 04 Risk: afferent/efferent quadrants (import edges only)
  const aff = (f) => importedBy.get(f)?.size ?? 0;
  const eff = (f) => imports.get(f)?.size ?? 0;
  const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const mx = med(allFiles.map(aff));
  const my = med(allFiles.map(eff));
  const W = 520, Hh = 340, px = (v) => 40 + v * ((W - 60) / (Math.max(...allFiles.map(aff), 1) || 1));
  const py = (v) => Hh - 30 - v * ((Hh - 60) / (Math.max(...allFiles.map(eff), 1) || 1));
  let dots = `<line x1="${px(mx)}" y1="10" x2="${px(mx)}" y2="${Hh - 30}" stroke="#999" stroke-dasharray="4"/>` +
    `<line x1="40" y1="${py(my)}" x2="${W - 20}" y2="${py(my)}" stroke="#999" stroke-dasharray="4"/>` +
    `<text x="${W - 24}" y="${Hh - 12}" font-size="10">afferent →</text><text x="2" y="16" font-size="10">↑ efferent</text>`;
  for (const f of allFiles) {
    const hot = aff(f) >= mx && eff(f) >= my && (aff(f) > 0 || eff(f) > 0);
    dots += `<circle cx="${px(aff(f))}" cy="${py(eff(f))}" r="${hot ? 7 : 4.5}" fill="${hot ? '#c14339' : '#1e6fb8'}"><title>${esc(f)} — in ${aff(f)}, out ${eff(f)}</title></circle>`;
  }
  const risk = `<svg viewBox="0 0 ${W} ${Hh}" width="640">${dots}</svg>` +
    `<p>Upper-right (red) = many dependents + many dependencies: changes propagate widely. Medians at ${mx}/${my}.</p>`;
  // 05 Functions: top by incoming calls
  const allFuncs = [];
  for (const [f, m] of funcs) for (const [n, c] of m) allFuncs.push([`${f} :: ${n}`, c]);
  allFuncs.sort((a, b) => b[1] - a[1]);
  const functions =
    `<table><tr><th>function</th><th>calls in</th></tr>` +
    allFuncs.slice(0, 25).map(([n, c]) => `<tr><td><code>${esc(n)}</code></td><td>${c}</td></tr>`).join('') +
    `</table><p>Top 25 of ${allFuncs.length} top-level functions. Zero-call functions are unlisted here, not necessarily dead (entry points, platform callbacks).</p>`;
  // 06 Layers: our dep-cruiser layering as columns
  const layerCols = [
    ['routes<br/>(pages)', allFiles.filter((f) => layerOf(f) === 0)],
    ['lib<br/>(logic)', allFiles.filter((f) => layerOf(f) === 1)],
    ['db<br/>(persistence)', allFiles.filter((f) => layerOf(f) === 2)],
    ['scripts + test<br/>(ops)', allFiles.filter((f) => layerOf(f) === 3 || layerOf(f) === 4)],
    ['.pi<br/>(isolated)', allFiles.filter((f) => layerOf(f) === 5)],
  ];
  const layers =
    `<svg viewBox="0 0 1090 120" width="100%">` +
    layerCols.map(([t, fs], i) => `<text x="${i * 218 + 109}" y="20" text-anchor="middle" font-weight="bold" font-size="12">${t}</text><text x="${i * 218 + 109}" y="38" text-anchor="middle" font-size="11">${fs.length} files</text>`).join('') +
    `<line x1="109" y1="60" x2="871" y2="60" stroke="#2e8b3d" stroke-width="2" marker-end="url(#ah)"/>` +
    `<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#2e8b3d"/></marker></defs>` +
    `<text x="490" y="56" font-size="10">routes → lib → db · ops aside · .pi isolated</text></svg>` +
    `<p>Mirrors .dependency-cruiser.mjs (4 rules, green). Violations fail check; this picture is the map, not the sensor.</p>`;
  const tabs = [['Structure', structure], ['Coupling', coupling], ['Cohesion', cohesion], ['Risk', risk], ['Functions', functions], ['Layers', layers]];
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Coupling dashboard</title>` +
      `<style>body{font-family:system-ui,sans-serif;max-width:1120px;margin:1.5rem auto;padding:0 1rem}` +
      `.tabs button{margin-right:.3rem;padding:.35rem .8rem;cursor:pointer}` +
      `.tabs button.on{font-weight:700}code{font-size:.82em}` +
      `.brow{display:flex;align-items:center;gap:.5rem;margin:.15rem 0}.blab{width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}` +
      `.bhead{display:flex;gap:.5rem;color:#666;font-size:.85em}.bhead span:nth-child(1){width:340px}` +
      `.bbar{display:inline-block;width:100px;background:#eee}.fi{display:inline-block;height:10px;background:#1e6fb8}.fo{display:inline-block;height:10px;background:#a06a15}.bn{width:120px;font-size:.85em}` +
      `.bbar.big{width:200px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.25rem .5rem;text-align:left}</style></head><body>` +
      `<h1>Coupling dashboard</h1><p>23 ts/js files via the TS compiler. Fan-in = dependents (look hard when these change). ` +
      `Generated by <code>node scripts/coupling.mjs dashboard</code>; .astro invisible (stated blind spot).</p>` +
      `<div class="tabs">${tabs.map(([t], i) => `<button data-t="${i}" class="${i === 0 ? 'on' : ''}">${t}</button>`).join('')}</div>` +
      tabs.map(([t, h], i) => `<section data-s="${i}" style="display:${i === 0 ? 'block' : 'none'}"><h2>${t}</h2>${h}</section>`).join('') +
      `<script>document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));b.classList.add('on');document.querySelectorAll('section').forEach(s=>s.style.display=s.dataset.s===b.dataset.t?'block':'none')})</script>` +
      `</body></html>\n`,
  );
  console.log(`wrote ${path.relative(root, out)}`);
} else {
  console.error('usage: coupling.mjs [json|hotspots|cycles|impact <file...>|html]');
  process.exit(2);
}
