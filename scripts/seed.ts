/**
 * Seed script: creates the admin user and upserts the initial mod catalog.
 *
 * Run: npm run db:seed  (requires .env with AUTH_SECRET / ADMIN_* — loads via --env-file)
 */
import { eq } from 'drizzle-orm';
import { auth } from '../src/lib/auth.ts';
import { db, schema } from '../db/client.ts';
import { slugify } from '../src/lib/mods.ts';
import { createHarnessVersion } from '../src/lib/harness.ts';

const NPM = 'https://www.npmjs.com/package/@earendil-works/pi-coding-agent';
const AGS = 'https://agents.md/';

interface SeedMod {
  title: string;
  category: string;
  summary: string;
  body: string;
  considered: boolean;
  implemented: boolean;
  wanted: boolean;
  tags: string[];
  links: { label: string; url: string }[];
}

const seedMods: SeedMod[] = [
  {
    title: 'Custom tools',
    category: 'Tooling',
    summary: 'Adding bespoke tools (read, bash, edit, write, …) the agent can call.',
    body: `The harness exposes a small set of built-in tools, and custom tools can be added. Each tool is described to the model with a name and JSON parameter schema; the agent invokes them from its loop.

**Thoughts:** the current toolset (read / bash / edit / write) covers most work, but domain-specific commands (e.g. database inspectors, repo-specific scripts) would reduce noise and token cost. Consider a convention for registering project tools via a plugin or a \`tools/\` directory.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['tools', 'tooling'],
    links: [{ label: 'Agent Skills spec (allowed-tools)', url: 'https://agentskills.io/specification' }],
  },
  {
    title: 'Skills',
    category: 'Knowledge',
    summary: 'Self-contained capability packages (SKILL.md + assets) loaded on demand.',
    body: `Skills follow the Agent Skills standard: a directory with a SKILL.md, discovered from global (~/.pi/agent/skills) and project (.pi/skills) locations. Descriptions are injected into the system prompt; full instructions load on demand.

**Thoughts:** we previously had three global skills (domain-modeling, grilling, grill-with-docs) and uninstalled them. The mechanism works well — worth keeping a smaller curated set or moving skills into the repo so they version with the project.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['skills', 'context'],
    links: [
      { label: 'Agent Skills spec', url: AGS },
      { label: 'Pi skills repo', url: 'https://github.com/badlogic/pi-skills' },
    ],
  },
  {
    title: 'Archify — validated architecture diagrams',
    category: 'Tooling',
    summary:
      'Agent skill turning codebases/descriptions into polished interactive HTML system maps (typed JSON IR + 9-gate showcase validation).',
    body: `Installed globally at ~/.agents/skills/archify (pi discovers it). The agent authors typed JSON IR against the architecture / workflow / sequence / dataflow / lifecycle schemas; Archify validates 9 showcase gates (crossings, corridors, label clearance, desktop readability) and returns machine-readable repair receipts, then delivers one self-contained HTML (+ PNG/SVG/WebM/share cards).

**Dogfooded:** mapped this repo → docs/harness-mods.architecture.html (6 components, primary Browse → API → SQLite path, better-auth + pi boundaries, 2 views, 3 cards). The delta/compare receipt discipline (added / removed / changed / moved per snapshot, inferred nothing) is worth borrowing for the /harness snapshot diffs.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['architecture', 'diagrams', 'skills', 'validation'],
    links: [
      { label: 'repo · tt-a1i/archify', url: 'https://github.com/tt-a1i/archify' },
      { label: 'architecture · open in app', url: '/docs/archify/harness-mods.architecture.html' },
      { label: 'better-auth flow · open in app', url: '/docs/archify/better-auth-flow.sequence.html' },
    ],
  },
  {
    title: 'Extensions',
    category: 'Extensibility',
    summary: 'Packaged plugins that extend the harness (custom tools, hooks, commands).',
    body: `Extensions are self-contained packages that add capabilities to the agent: custom tools, UI commands, middleware hooks. The extension API is documented in docs/extensions.md with examples in the examples/ directory.

**Thoughts:** this is the primary integration point for "tools I want in my harness". Sketch an extension skeleton early; decide whether extensions live in-repo or as npm packages. Entry status: **not yet implemented** in the current setup.`,
    considered: false,
    implemented: false,
    wanted: false,
    tags: ['extensions', 'plugins'],
    links: [{ label: 'npm package', url: NPM }],
  },
  {
    title: 'Themes',
    category: 'TUI',
    summary: 'Custom color/theme packs for the terminal UI (docs/themes.md).',
    body: `The TUI supports themes. Changing the look of the harness makes long sessions more comfortable and communicates state (e.g. which session is active).

**Thoughts:** low effort, low value. Only worth doing if we find the default uncomfortable.`,
    considered: false,
    implemented: false,
    wanted: false,
    tags: ['tui', 'cosmetic'],
    links: [{ label: 'npm package', url: NPM }],
  },
  {
    title: 'Prompt templates',
    category: 'Knowledge',
    summary: 'Custom reusable prompt templates injected into conversations.',
    body: `Prompt templates give the model recurring instructions (project conventions, review checklists) beyond the system prompt. docs/prompt-templates.md.

**Thoughts:** AGENTS.md already covers a lot of this ground for this repo. Templates are useful for repeatable non-project workflows (e.g. "write a changelog entry"). Could be worth one or two templates; over-engineering risk is high.`,
    considered: false,
    implemented: false,
    wanted: false,
    tags: ['prompts', 'context'],
    links: [{ label: 'npm package', url: NPM }],
  },
  {
    title: 'TUI components',
    category: 'TUI',
    summary: 'Custom panels, widgets, or commands in the terminal UI (docs/tui.md).',
    body: `The TUI is componentized: keybindings, panels, commands can be customized. docs/tui.md documents the API.

**Thoughts:** powerful but the most invasive surface. A custom status panel showing the current harness-mod statuses would be a nice dogfood project — but defer until extensions are proven.`,
    considered: false,
    implemented: false,
    wanted: false,
    tags: ['tui'],
    links: [{ label: 'npm package', url: NPM }],
  },
  {
    title: 'Keybindings',
    category: 'TUI',
    summary: 'Custom keymap for the terminal UI (docs/keybindings.md).',
    body: `Keybindings living in config. Remapping defaults to personal muscle memory.

**Thoughts:** trivial to do per-machine; not needed yet. Revisit if a binding conflicts.`,
    considered: false,
    implemented: false,
    wanted: false,
    tags: ['tui', 'config'],
    links: [{ label: 'npm package', url: NPM }],
  },
  {
    title: 'SDK integrations',
    category: 'Integrations',
    summary: 'Embed the harness programmatically in other apps (docs/sdk.md).',
    body: `The SDK lets other applications drive the agent programmatically — starting sessions, streaming tool calls, subscribing to events.

**Thoughts:** the natural fit for "the web app controls the harness" style automation. Probably overkill short-term, but an SDK-backed CI reviewer or "ask the harness from the catalog app" feature is a strong long-term project.`,
    considered: false,
    implemented: false,
    wanted: false,
    tags: ['sdk', 'automation'],
    links: [{ label: 'npm package', url: NPM }],
  },
  {
    title: 'Custom provider',
    category: 'Providers',
    summary: 'Point the harness at a custom model provider (docs/custom-provider.md).',
    body: `Currently configured with provider \`opencode-go\` (default in ~/.pi/agent/settings.json), with credentials stored in auth.json.

**Thoughts:** switching providers is config-only. Worth experimenting with a second provider for cost comparison once there's a clear workload. Implemented today via opencode-go.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['provider', 'models'],
    links: [{ label: 'npm package', url: NPM }],
  },
  {
    title: 'Model management',
    category: 'Providers',
    summary: 'Curating which models are available/selected (models-store.json).',
    body: `~/.pi/agent/models-store.json holds the provider registry; current model is deepseek-v4-flash via opencode-go. docs/models.md covers adding models.

**Thoughts:** model choice is the highest-leverage lever on UX. Track result quality per model in this catalog once we have a few candidate models to compare.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['models', 'provider'],
    links: [{ label: 'npm package', url: NPM }],
  },
  {
    title: 'Pi packages',
    category: 'Extensibility',
    summary: 'Reusable packages the harness can install (docs/packages.md).',
    body: `Packages bundle extensions, themes, and commands into installable units.

**Thoughts:** packaging matters once we have extensions worth sharing across projects. Keep on the radar; don't build until there's a concrete need.`,
    considered: false,
    implemented: false,
    wanted: false,
    tags: ['packages', 'distribution'],
    links: [{ label: 'npm package', url: NPM }],
  },
  {
    title: 'Environment variables',
    category: 'Configuration',
    summary: 'PI_* env vars that tune runtime behavior (docs/environment-variables.md).',
    body: `The harness reads PI_* environment variables for current model/session context and runtime settings.

**Thoughts:** invisible but everywhere — worth a documented list in this repo's AGENTS.md once we depend on specific ones. Mostly used for observability today.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['env', 'config'],
    links: [{ label: 'npm package', url: NPM }],
  },
  {
    title: 'Settings.json',
    category: 'Configuration',
    summary: 'Core config file: default provider, model, and harness options.',
    body: `~/.pi/agent/settings.json currently sets defaultProvider: opencode-go and defaultModel: deepseek-v4-flash, plus lastChangelogVersion.

**Thoughts:** the canonical place to manage defaults. settings.json = the single source of truth for which model the harness uses; keep it minimal and reviewed.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['config'],
    links: [{ label: 'npm package', url: NPM }],
  },
  {
    title: 'AGENTS.md',
    category: 'Knowledge',
    summary: 'Repo context file agents read automatically (project overview, commands, conventions).',
    body: `AGENTS.md is a standard Markdown file at repo root that coding agents parse automatically. No required fields — anything you'd tell a new teammate. Nested AGENTS.md files allow per-subproject instructions; nearest file wins.

**Thoughts:** highest ROI of all entries — we just created one for this repo. Keep it alive: update it whenever the project's commands or conventions change, and let it be the canonical "how to work here" doc.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['context', 'docs'],
    links: [{ label: 'agents.md spec', url: AGS }],
  },
  {
    title: 'Principles',
    category: 'Knowledge',
    summary: 'Durable value statements the agent applies with judgment — the top inferential feedforward guide (they outrank other guidance on conflict).',
    body: `Principles are the top layer of the Guides stack (see docs/Harness review — feedforward guides.md): short, durable value statements the agent must **interpret**, not mechanically follow — that's why they're inferential. Distinct from Rules (checkable constraints), Ref Docs (facts), and How-tos (procedures); principles are the tiebreaker when rules conflict or a situation is ambiguous.

Ours (extracted into AGENTS.md, 2026-09):

1. **Minimalism** — only the code the immediate problem needs; no speculative features, abstractions, or predictive configs.
2. **Surgical edits** — touch only the lines the task requires; leave adjacent code untouched.
3. **Goal-driven** — steps with explicit success criteria; verify before claiming done.
4. **Clarify, don't guess** — state assumptions; halt on ambiguity.
5. **Receipts over prose** — sensors/checks report stable, machine-readable facts.
6. **Sensors before handoff** — run \`npm run check\` (build + behaviour flows) before declaring work done.
7. **Snapshots are point-in-time truth** — diffs must never mislead; no silent history rewrites.
8. **Secrets only via env** — never logged, echoed, or committed.
9. **Fix the kit first** — recurring issues get fixed in skills/conventions/checks, not just the instance.

**Thoughts:** these existed implicitly inside AGENTS.md's instruction paragraph, unlabeled and mixed with mundane rules. Extracting them as a labeled block makes the steering explicit — the agent reads them every turn and uses them as tiebreakers (earned lessons like "snapshots are point-in-time truth" came from real incidents: the v5/v6 context-drop confusion).`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['principles', 'agents-md', 'feedforward', 'guides'],
    links: [
      { label: 'article — guides', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'our review (fig 2)', url: 'docs/Harness review — feedforward guides.md' },
    ],
  },
  {
    title: 'Cross-functional requirements (CfRs)',
    category: 'Knowledge',
    summary: 'How the system performs, not what it does — quality bars (security, integrity, portability, usability, maintainability) fed forward to the agent as inferential guides.',
    body: `CfRs (formerly non-functional requirements) define how a system performs rather than what it does — qualities that cut across features: security, performance, scalability, maintainability, reliability. In the Guides stack they are inferential feedforward: an agent told to "add mod search" will do the feature but will not spontaneously consider quality expectations unless they are fed forward.

Disambiguation (researched 2026-09): CfR is also used for Change Failure Rate (a DORA metric — that is a *sensor*, not a guide) and 21 CFR Part 11 (FDA compliance) — neither is the Guides meaning.

Handling (the article-endorsed move): translate CfRs into architectural building blocks or **testable acceptance criteria** — the bridge to the Architecture-fitness harness: CfRs as guides (feedforward) + fitness-function tests as sensors (feedback). Some CfRs graduate to computational sensors — ours already are: the check suite (build + behaviour flows) and browser-qa verify build/usability on every run.

Ours (added to AGENTS.md, 2026-09):

1. **Security** — secrets only via env; httpOnly session cookies; origin checks enforced.
2. **Data integrity** — snapshots are point-in-time truth; idempotent seeding/migrations.
3. **Environment portability** — identical behaviour across dev / preview / production (AUTH_URL, NODE_ENV-dependent cookie flags); verify in real conditions, not just dev.
4. **Real-browser usability** — served URLs must work in actual browsers (content negotiation, cookies), not only via curl (earned: the /docs/archify Accept-header 404).
5. **Maintainability** — typed artifacts, machine-readable receipts, kit-vs-instance separation.
6. **Performance/scalability** — explicitly loose: local single-user tool; do not over-engineer.

**Thoughts:** same story as Principles — the earned lessons were de-facto CfRs (environment portability and real-browser usability came from the preview 403 and the static-serving 404 incidents) but existed only as incident fixes. Stating them as requirements means the agent sees the quality bars when starting feature work, and to-spec captures the per-feature subset as testable criteria.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['cfrs', 'nfrs', 'feedforward', 'guides', 'fitness-functions'],
    links: [
      { label: 'article — guides', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'CfR handling (Kua)', url: 'https://thekua.com/atwork/2017/05/three-ways-to-handle-cfrs/' },
      { label: 'GovStack CFR architecture', url: 'https://govstack.gitbook.io/cfr-architecture/6-cross-functional-requirements' },
    ],
  },
  {
    title: 'Reference docs (Ref Docs)',
    category: 'Knowledge',
    summary: 'Facts to consult on demand, not instructions — the progressive-disclosure guides: zero token cost until needed; quality = discoverable AND current.',
    body: `Ref Docs are the "what is true about this system" layer of the Guides stack (Principles = values, Rules/CfRs = constraints, How-tos = procedures, Ref Docs = facts). Inferential because the agent must decide to look and interpret what it finds; economical because they cost zero tokens until loaded — but only if they are discoverable.

Two failure modes define quality:

1. **Stale doc** — worse than no doc: the agent trusts it. (The article's coherence worry: guides must not contradict each other.)
2. **Invisible doc** — exists but nobody knows when to read it.

Ours (added 2026-09):

1. **Doc index in AGENTS.md** — five docs with when-to-read purpose; the agent sees the index every turn.
2. **Refreshed docs/current-harness.md to v7** — was written at v3-era ("5 skills", ≈40k context) while AGENTS.md said 15 — two ref docs disagreeing is exactly the incoherence failure. Now stamped "Verified at snapshot v7" and restructured to defer to /harness + snapshots for live values.
3. **Single-source rule** — ref docs link to systems of record (/harness, snapshots); they do not copy drifting facts. Stated in AGENTS.md + the glossary.
4. **Glossary** — in the reuse contract: Kit/Instance, Guide, Sensor, CfR, Receipt, Steering loop, check, Snapshot/C4 artifact, Mod, Single-source rule.

**Thoughts:** earned lessons drove this — current-harness.md sat stale from v3 through v5 while facts drifted elsewhere, and the /docs/archify serving incident proved "discoverable + current" is the whole game. A stale ref doc actively misleads the agent; an invisible one never helps.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['ref-docs', 'docs', 'feedforward', 'guides', 'index'],
    links: [
      { label: 'article — guides', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'our review (fig 2)', url: 'docs/Harness review — feedforward guides.md' },
    ],
  },
  {
    title: 'Browser QA',
    category: 'Tooling',
    summary: 'Headless browser sensor (Playwright + system Chrome): console/DOM/error checks, --eval full DOM API, sign-in flow, screenshots — the app\'s behaviour harness.',
    body: `Project skill (.pi/skills/browser-qa + playwright-core devDependency): a scriptable headless-Chrome sensor for the harness app — the behaviour side of the article's regulation model (it catches what typecheck/build cannot: the page actually rendering, the auth flow actually working, the browser actually accepting our responses).

What it does (node .pi/skills/browser-qa/scripts/qa.mjs <url> [flags]):

1. **Error capture** — console errors/warnings, uncaught page errors, failed requests, per run.
2. **DOM assertions** — --assert / --reject selectors, --text presence, --wait.
3. **--eval <js>** — the full browser DOM API via page.evaluate: e.g. on /harness → {"svg":1,"pills":6,"snap":6,"iframes":2} (mermaid rendered, 6 version pills, 2 archify iframes).
4. **--login** — fills #loginForm, submits, waits for the /admin redirect (creds via ADMIN_EMAIL/ADMIN_PASSWORD env — never hardcoded).
5. **--shot** — full-page PNGs to public/screenshots/ (served at /screenshots/…).

Wired into the suite: scripts/qa-flows.mjs runs 4 flows (catalog, harness, archify, login) and npm run check gates them after a build. All 4 green: 0 console errors / 0 page errors / 0 failed requests on the preview build.

**Earned lessons (this sensor already paid rent):** it caught the /docs/archify serving failure (curl got 200 with Accept */*, real browsers got 404 — Accept: text/html) and the preview login 403 (better-auth origin vs AUTH_URL mismatch + Secure cookies over http). Both were invisible to curl and build checks.

Dev-mode caveat: npm run dev emits Vite dev-toolbar 504s in headless runs — expect-error-free is meaningful against the prod build (npm run preview), which check self-serves.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['browser', 'qa', 'sensor', 'playwright', 'behaviour'],
    links: [
      { label: 'playwright-core', url: 'https://playwright.dev' },
      { label: 'check flows (runner)', url: 'scripts/qa-flows.mjs' },
      { label: 'screenshots', url: '/screenshots/qa-harness-map.png' },
    ],
  },
  {
    title: 'Workflow pipeline (grill → spec → tickets → slices)',
    category: 'Workflow',
    summary: 'Matt Pocock–style engineering skills, pi-adapted: grilling, to-spec, to-tickets, implement (+ grill-me wrapper).',
    body: `Five skills in ~/.pi/agent/skills/ that give the harness a deliberate plan→build pipeline:

1. **grilling** (trigger-invokable) — the design interview: maps the topic into a *design tree*, asks it in *rounds* (whole frontier at once, numbered questions each with a recommended answer), and finds all *facts* itself via the firecrawl search skills + read/bash. Ends when the frontier is empty and the user confirms shared understanding. Greenfield fullstack project: seeds from a 14-area coverage list (requirements → architecture → risks/compliance → integrations → data lifecycle → dev env → backend → frontend → testing → infra/DevOps → deployment → monitoring → release → post-launch). New features: only the applicable subset.
2. **to-spec** (/skill:to-spec, deliberate) — no-interview synthesis of the settled tree → docs/specs/<slug>.md (Problem/Solution/User Stories/Implementation Decisions/single highest Test Seam/Open Questions).
3. **to-tickets** (/skill:to-tickets) — tracer-bullet *vertical slice* tickets at docs/tickets/NN-<slug>.md with \`blocks:\` edges (full path schema→API→UI→tests, demoable alone, one fresh context window; wide refactors handled via expand–contract). Quizzes the user on the breakdown.
4. **implement** (/skill:implement) — one unblocked ticket at a time, TDD at the spec's seam, typecheck + targeted tests regularly, full suite at the end, self-review, commit \`ticket N: …\`.
5. **grill-me** (/skill:grill-me) — explicit entry point running the grilling protocol.

**Thoughts:** adaptations vs. the upstream repo: facts go through our firecrawl search skills instead of a sub-agent; the tracker is local markdown (docs/specs, docs/tickets) instead of an issue tracker; the deliberate steps are disable-model-invocation so the pipeline never runs accidentally. The correctness of each spec depends on grilling actually settling the tree — keep specs honest about Open Questions.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['workflow', 'planning', 'skills', 'pipeline'],
    links: [
      { label: 'mattpocock/skills', url: 'https://github.com/mattpocock/skills' },
      { label: 'Agent Skills spec', url: AGS },
    ],
  },
];

async function upsertMods() {
  const now = Date.now();
  for (const s of seedMods) {
    const slug = slugify(s.title);
    const existing = await db.query.mods.findFirst({ where: (m, { eq }) => eq(m.slug, slug) });
    const value = {
      title: s.title,
      slug,
      category: s.category,
      summary: s.summary,
      body: s.body,
      considered: s.considered ? 1 : 0,
      implemented: s.implemented ? 1 : 0,
      wanted: s.wanted ? 1 : 0,
      tags: JSON.stringify(s.tags),
      links: JSON.stringify(s.links),
      updatedAt: now,
    };
    if (existing) {
      await db.update(schema.mods).set(value).where(eq(schema.mods.slug, slug));
      console.log(`upserted: ${s.title} (updated)`);
    } else {
      await db.insert(schema.mods).values({ ...value, id: crypto.randomUUID(), createdAt: now });
      console.log(`upserted: ${s.title} (created)`);
    }
  }
}

async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@harness.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!password) {
    console.error('ADMIN_PASSWORD not set — skipping admin user creation. Set it in .env and re-run.');
    return;
  }
  const existing = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.email, email) });
  if (existing) {
    const acct = await db.query.account.findFirst({
      where: (a, { eq, and, isNotNull }) =>
        and(eq(a.userId, existing.id), eq(a.providerId, 'credential'), isNotNull(a.password)),
    });
    if (acct) {
      console.log(`admin exists: ${email}`);
      return;
    }
    // user row exists but has no password account (e.g. interrupted earlier seed) — recreate
    console.log(`admin user ${email} has no password — recreating`);
    await db.delete(schema.user).where(eq(schema.user.email, email));
  }
  const res = await auth.api.signUpEmail({
    body: { email, password, name: 'Admin' },
  });
  if (res.token) {
    console.log(`admin created: ${email}`);
  } else {
    console.error('admin creation failed', res);
  }
}

async function ensureVersion1() {
  const rows = await db.select().from(schema.harnessVersions);
  if (rows.length > 0) {
    console.log(`harness versions exist (${rows.length}) — v1 already seeded`);
    return;
  }
  const { version } = await createHarnessVersion('current', 'Initial snapshot of the harness at setup');
  console.log(`harness v${version} created`);
}

async function main() {
  console.log('Seeding database…');
  await upsertMods();
  await ensureAdmin();
  await ensureVersion1();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});