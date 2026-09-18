// Unit tests for the pure lib core — the code that runs IN this process,
// so --experimental-test-coverage reports honest numbers (unlike the
// black-box HTTP suite, which correctly measures nothing here).
// Run: npm run coverage
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildC4Graph, c4HlLabels } from '../src/lib/c4.ts';
import { resolveSlug, slugify, toView } from '../src/lib/mods.ts';
import { estimateTokens } from '../src/lib/context.ts';
import { parseMod, parseVersion } from '../src/lib/parse.ts';

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

describe('resolveSlug', () => {
  it('blank explicit slug falls back to the title (admin posts slug:"")', () => {
    assert.equal(resolveSlug('', 'Repo - Single Source of Truth'), 'repo-single-source-of-truth');
    assert.equal(resolveSlug('   ', 'Some Title'), 'some-title');
    assert.equal(resolveSlug(undefined, 'Some Title'), 'some-title');
  });
  it('explicit slug wins when present', () => {
    assert.equal(resolveSlug('custom-slug', 'Some Title'), 'custom-slug');
  });
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

describe('parseMod (boundary parsing, not validation)', () => {
  it('accepts a full valid body and trims identity fields', () => {
    const r = parseMod({ title: '  Hi  ', tags: ['a'], links: [{ label: 'l', url: 'u' }], considered: true });
    assert.equal(r.ok, true);
    assert.equal(r.value.title, 'Hi');
    assert.deepEqual(r.value.tags, ['a']);
  });
  it('rejects wrong shapes with messages, never throws', () => {
    for (const bad of [null, [1], 'x', { title: 12345 }, { tags: 'nope' }, { links: [{ label: 1 }] }, { considered: 'yes' }]) {
      const r = parseMod(bad);
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.ok(r.error.length > 0);
    }
  });
  it('empty title parses (requiredness is the route’s job)', () => {
    assert.equal(parseMod({ title: '   ' }).value.title, undefined);
  });
});

describe('parseVersion', () => {
  it('rejects non-strings that used to 500 on .trim()', () => {
    assert.equal(parseVersion({ label: 42 }).ok, false);
    assert.equal(parseVersion('x').ok, false);
    assert.equal(parseVersion({ label: 'v', summary: 's' }).ok, true);
  });
});

// deterministic PRNG (mulberry32) — property fuzz without dependencies,
// same inputs every run
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('slugify properties', () => {
  const rand = rng(20260915);
  const alphabet = 'abcXYZ019 _-+.,!?()[]{}@#%&/\\éü🎉';
  const arb = (maxLen) => {
    let s = '';
    const n = Math.floor(rand() * maxLen);
    for (let i = 0; i < n; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
    return s;
  };
  const cases = Array.from({ length: 300 }, () => arb(120));
  it('output charset is [a-z0-9-], max 80 chars', () => {
    for (const s of cases) {
      const slug = slugify(s);
      assert.match(slug, /^[a-z0-9-]*$/, JSON.stringify(s));
      assert.ok(slug.length <= 80, slug);
    }
  });
  it('idempotent: slugify(slugify(x)) === slugify(x)', () => {
    for (const s of cases) assert.equal(slugify(slugify(s)), slugify(s));
  });
  it('trims separators (Stryker survivors: regex mutants lived here)', () => {
    assert.equal(slugify('  hello  '), 'hello');
    assert.equal(slugify('--a--'), 'a');
    assert.equal(slugify(' - x - '), 'x');
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
