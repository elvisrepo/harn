// Unit tests for the pure lib core — the code that runs IN this process,
// so --experimental-test-coverage reports honest numbers (unlike the
// black-box HTTP suite, which correctly measures nothing here).
// Run: npm run coverage
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildC4Graph, c4HlLabels } from '../src/lib/c4.ts';
import { slugify, toView } from '../src/lib/mods.ts';
import { estimateTokens } from '../src/lib/context.ts';

describe('slugify', () => {
  const cases = [
    ['CLIs + scripts', 'clis-scripts'],
    ['Language servers (astro check)', 'language-servers-astro-check'],
    ['  Hello, World!  ', 'hello-world'],
    ['a'.repeat(100), 'a'.repeat(80)],
    ['', ''],
  ];
  for (const [title, want] of cases) {
    it(JSON.stringify(title).slice(0, 40), () => assert.equal(slugify(title), want));
  }
});

describe('toView', () => {
  const row = (over = {}) => ({
    id: 'id1', slug: 's', title: 't', category: 'c', summary: 'su', body: 'b',
    considered: 1, implemented: 0, wanted: 1,
    tags: '["a","b"]', links: '[{"label":"l","url":"u"}]',
    createdAt: 1, updatedAt: 2, ...over,
  });
  it('maps 0/1 flags to booleans and parses JSON columns', () => {
    const v = toView(row());
    assert.equal(v.considered, true);
    assert.equal(v.implemented, false);
    assert.equal(v.wanted, true);
    assert.deepEqual(v.tags, ['a', 'b']);
    assert.deepEqual(v.links, [{ label: 'l', url: 'u' }]);
  });
  it('falls back to [] on malformed JSON', () => {
    const v = toView(row({ tags: 'nope{', links: '' }));
    assert.deepEqual(v.tags, []);
    assert.deepEqual(v.links, []);
  });
});

describe('estimateTokens', () => {
  it('chars ÷ 4, rounded up', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens('abcd'), 1);
    assert.equal(estimateTokens('abcde'), 2);
  });
});

describe('c4HlLabels', () => {
  const snap = (over = {}) => ({
    provider: 'p', model: 'm', tools: ['read'], skills: ['x'], skillsInstalled: 1,
    authToken: { status: 'present' }, contextTokens: { totalTokens: 100 }, ...over,
  });
  it('identical snapshots → no highlights', () => {
    assert.deepEqual(c4HlLabels(snap(), snap()), []);
  });
  it('flags each changed dimension', () => {
    const s = snap();
    assert.ok(c4HlLabels({ ...s, provider: 'q' }, s).includes('provider'));
    assert.ok(c4HlLabels({ ...s, model: 'n' }, s).includes('model'));
    assert.ok(c4HlLabels({ ...s, tools: ['read', 'bash'] }, s).includes('tools'));
    assert.ok(c4HlLabels({ ...s, skills: ['y'], skillsInstalled: 1 }, s).includes('skills'));
    assert.ok(c4HlLabels({ ...s, authToken: { status: 'missing' } }, s).includes('credential'));
    assert.ok(c4HlLabels({ ...s, contextTokens: { totalTokens: 200 } }, s).includes('context / turn'));
  });
});

describe('buildC4Graph', () => {
  const graph = buildC4Graph({ skills: ['firecrawl search', 'grilling'] });
  it('is a flowchart with the agent loop and LSP nodes', () => {
    assert.match(graph, /^flowchart TB/);
    assert.match(graph, /EXT\[/);
    assert.match(graph, /LSP\[/);
    assert.match(graph, /typescript-language-server/);
  });
  it('edge labels contain no square brackets (mermaid parse regression)', () => {
    // earned: `17 · [LSP] receipt …` failed render with `got 'SQS'` — the
    // browser caught it; this pins it computationally instead
    for (const m of graph.matchAll(/\|([^|]*)\|/g)) {
      assert.ok(!/[\[\]]/.test(m[1]), `brackets in edge label: ${m[1]}`);
    }
  });
  it('numbered steps are contiguous from 1', () => {
    const steps = [...graph.matchAll(/\|(\d+) ·/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
    assert.ok(steps.length > 0);
    assert.deepEqual(steps, steps.map((_, i) => i + 1));
  });
});
