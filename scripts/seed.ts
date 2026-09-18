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
2. **Refreshed docs/current-harness.md to v12** — was written at v3-era ("5 skills", ≈40k context) while AGENTS.md said 15 — two ref docs disagreeing is exactly the incoherence failure; refreshed again at v12 (15 skills, ≈3.8k context, LSP section, opencode-era framing). Now stamped "Verified at snapshot v12" and restructured to defer to /harness + snapshots for live values.
3. **Single-source rule** — ref docs link to systems of record (/harness, snapshots); they do not copy drifting facts. Stated in AGENTS.md + the glossary.
4. **Glossary** — in the reuse contract: Kit/Instance, Guide, Sensor, CfR, Receipt, Steering loop, check, Snapshot/C4 artifact, Mod, Single-source rule.

**Thoughts:** earned lessons drove this — current-harness.md sat stale from v3 through v5 while facts drifted elsewhere, and the /docs/archify serving incident proved "discoverable + current" is the whole game. A stale ref doc actively misleads the agent; an invisible one never helps.`,    considered: true,
    implemented: true,
    wanted: false,
    tags: ['ref-docs', 'docs', 'feedforward', 'guides', 'index'],
    links: [
      { label: 'article — guides', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'our review (fig 2)', url: 'docs/Harness review — feedforward guides.md' },
    ],
  },
  {
    title: 'Architecture doc (architecture.md)',
    category: 'Knowledge',
    summary: 'The Fig-3 feedforward guide for the app itself: routes, pipeline, data, earned gotchas — the buddy the agent reads before changing any route/table/flow.',
    body: `The article's change-lifecycle figure feeds architecture.md into initial generation: a curated map of the system under work, distinct from the harness around the agent (that's docs/current-harness.md). Ours lives at the repo root, indexed first in the AGENTS.md ref-docs list:

- **Routes table** — every page + API with handler file, auth level, and notes (incl. the Astro-7 destructured-exports gotcha).
- **Request pipeline** — middleware session handling, page gate vs API re-check, Origin + JSON content-type discipline.
- **Data** — schema summary, catalog-is-code rule, snapshot/C4 flow.
- **Static-serving gotcha** — marked do-not-regress, pinned by tests.
- **Where behaviour is proven** — suite / unit / browser mapping per area.

**Thoughts:** the audit that earned it found the AGENTS.md arch map missing 10 entries and current-harness.md stamped v7 in a v12 world — the article's coherence failure, live. One buddy doc, single-sourced, indexed where the agent looks every turn.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['architecture', 'ref-docs', 'feedforward', 'guides'],
    links: [
      { label: 'article — change lifecycle', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'the buddy', url: 'architecture.md' },
    ],
  },
  {
    title: 'How-to-test',
    category: 'Knowledge',
    summary: 'The Fig-3 feedforward testing guide: how-tos §5 plus the executable suite — doc, tests, and norm agreeing on what green looks like.',
    body: `The testing counterpart of the bootstrap skill: instructions telling the agent how this repo tests before it writes — seams, commands, green, failure reading.

Complete in three layers (2026-09):

1. **Doc** — docs/Harness how-tos.md §5: exact commands, expected receipts, per-step failure table (incl. a test-failure row, so a failing seam sends the reader somewhere).
2. **Executable** — test/ (9 HTTP seam tests) + test/lib.test.mjs (13 unit tests), both inside npm run check.
3. **Norm** — AGENTS.md Testing section plus implement's TDD steps (with the exact mid-loop and full commands spelled out) and the review checklist's receipts line.

**Thoughts:** doc, executable, and norm agreeing is rare enough to state outright — most repos have two of three, and the missing one is usually the doc. Fixed in the same pass: implement step 4 now names npm run check instead of "the full test suite".`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['how-to-test', 'testing', 'feedforward', 'guides'],
    links: [
      { label: 'article — change lifecycle', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'run & interpret check', url: 'docs/Harness how-tos.md' },
    ],
  },
  {
    title: 'MCP knowledge',
    category: 'Tooling',
    summary: 'The Fig-3 knowledge-protocol entry: the knowledge exists (docs, journal, catalog, snapshots) but no MCP server exposes it — files win on context cost; remote docs are the trigger.',
    body: `The figure's knowledge-management entry: the agent querying team knowledge at generation time through a protocol instead of relying on what is in context.

Status (2026-09): gap that mostly isn't. pi has no MCP client; opencode does (opencode.json → mcp, verified in its docs) but this repo has no opencode.json — zero servers configured. The knowledge itself is complete: indexed docs, decision journal, 29-mod catalog, 14 snapshots.

Why files win: opencode's own MCP page warns servers add to context every turn. Files + grep + progressive disclosure give the same knowledge at zero cost until needed.

Split: in-repo knowledge → files, no MCP warranted. Off-repo (library API docs) → firecrawl skills cover it via CLI today; a Context7-style remote is the convenience upgrade. Trigger: repeated off-repo lookups firecrawl handles clumsily, or multi-repo knowledge.`,
    considered: true,
    implemented: false,
    wanted: false,
    tags: ['mcp', 'knowledge', 'feedforward', 'deferred'],
    links: [
      { label: 'article — change lifecycle', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'opencode MCP servers', url: 'https://opencode.ai/docs/mcp-servers' },
    ],
  },
  {
    title: 'Self-correction loop',
    category: 'Workflow',
    summary: 'The Fig-3 first feedback ring, run pre-handoff inside npm run check: review checklist + eslint + semgrep + coverage, with dep-cruiser parked on trigger.',
    body: `The figure's self-correction loop: the agent's first feedback pass before human eyes — fast controls, every change, fix before handoff. Ours runs pre-handoff inside npm run check:

1. **/code-review** → implement step-6 read-back checklist (minimalism · scope · CfRs · catalog mirror · receipts). Same model, ritualized; second-model review waits on a semantic slip.
2. **eslint** → flat config (recommended minus tsc-covered noise), green in check.
3. **semgrep** → 2 earned rules (no absolute-local fetch, no eval), 0 findings in check.
4. **coverage** → unit-tested lib core with real per-file lines (thresholds off until earned); black-box HTTP coverage proven unmeasurable on this server, suite proves the seams instead.
5. **dep-cruiser** → adopted 2026-09-10 (trigger pulled early by explicit call): 4 layer rules in check, green day one (46 modules, 79 deps, 0 violations). Blind spot stated: .astro frontmatter invisible.

**Thoughts:** the pipeline re-run half of the figure doesn't exist here (no CI) — the same command serves both halves. The loop closed fully 2026-09-10 when dep-cruiser's parked trigger was pulled early by explicit call.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['self-correction', 'feedback', 'check', 'loop'],
    links: [
      { label: 'article — change lifecycle', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'run & interpret check', url: 'docs/Harness how-tos.md' },
    ],
  },
  {
    title: 'Dead code detection',
    category: 'Tooling',
    summary: 'Fig-4 continuous drift sensor (/find-dead-code): no watcher at our size — a one-shot manual pass plus the Minimalism principle instead.',
    body: `The figure's /find-dead-code: a continuous sensor watching for code nobody calls, so rot accumulates visibly instead of silently.

Status (2026-09): no watcher, by decision — a 30-file repo is cheaper to eyeball than to configure knip for. What exists instead:

1. **One-shot pass, done 2026-09-10:** a references grep over the tree. Found exactly one corpse — measure.mjs, a one-off Playwright measuring helper from the archify-visual-check session, zero references, no doc mentions — deleted on the spot.
2. **The standing norm:** Minimalism (only the code the immediate problem needs) plus review-checklist read-backs keep new dead code out.

Revisit trigger: the tree past ~100 source files, or a second corpse found by hand — whichever first earns a real watcher.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['dead-code', 'drift', 'continuous', 'minimalism'],
    links: [
      { label: 'article — continuous feedback', url: 'https://martinfowler.com/articles/harness-engineering.html' },
    ],
  },
  {
    title: 'Dependabot',
    category: 'Tooling',
    summary: 'Fig-4 continuous drift sensor for the npm tree: weekly vulnerability PRs (max 3 open); the one figure element that was a genuine gap.',
    body: `The figure's dependabot: someone else's vulnerabilities arrive on their schedule, not ours — 30+ npm deps here including Astro, better-auth, and drizzle. This was the one Fig-4 element that was a genuine gap rather than a scoped-out luxury.

Implemented (2026-09-10): .github/dependabot.yml — npm, weekly, max 3 open PRs. Each PR is just another change walking into the pipeline: check runs on it, the review checklist reads it, the human merges.

Deliberately excluded: pip/semgrep rides untracked (pip install, no requirements file) — pin it only if its version ever matters. Same for the weekly cadence: faster than our ability to review would just stack PRs.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['dependabot', 'drift', 'continuous', 'dependencies', 'security'],
    links: [
      { label: 'article — continuous feedback', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'dependabot config', url: '.github/dependabot.yml' },
    ],
  },
  {
    title: 'Coverage quality',
    category: 'Tooling',
    summary: 'Fig-4 /code-coverage-quality: not the percentage but whether tests are toothless — answered here by the 4/4 mutation probe, with thresholds off until earned.',
    body: `The figure's /code-coverage-quality: the continuous version of the coverage question — not "which lines execute" but "is the suite rotting". Distinct from the coverage number (see the Static analysis and Mutation testing mods).

Status (2026-09): no continuous watcher. What stands in for it:

1. **Unit thresholds off until earned** — the uncovered-lines list is feedback per run, not a gate.
2. **The 4/4 manual mutation probe** — the quality half, answered with evidence instead of a standing tool.
3. **The steering-loop tripwire proposal** — if built, suite-rot detection is one of its named jobs.

Revisit trigger: suite past ~30 tests (the number where rot outruns eyeballs), or a test going hollow unnoticed.`,
    considered: true,
    implemented: false,
    wanted: false,
    tags: ['coverage-quality', 'drift', 'continuous', 'tests'],
    links: [
      { label: 'article — continuous feedback', url: 'https://martinfowler.com/articles/harness-engineering.html' },
    ],
  },
  {
    title: 'Runtime SLOs',
    category: 'Tooling',
    summary: 'Fig-4 latency / error-rate / availability monitors: explicitly out of scope — no runtime, no users, no objectives to serve.',
    body: `The figure's computational runtime ring: latency, error rate, availability SLOs feeding agent suggestions. The cheapest, most deterministic continuous sensors in the figure — for a system that serves traffic.

Status (2026-09): out of scope, same reasoning as the Logs decision. This app serves one local human from a dev/preview server that exists only while looked at. There is no latency to degrade, no error budget to burn, no availability to promise. A status page here would monitor the developer's laptop.

Revisit order, if this ever serves anyone: error-rate first (the browser flows already assert zero console/page errors per run — the seed of it), then availability, then latency. Objectives before monitors: an SLO nobody agreed is just a number.`,
    considered: true,
    implemented: false,
    wanted: false,
    tags: ['slo', 'runtime', 'continuous', 'out-of-scope'],
    links: [
      { label: 'article — continuous feedback', url: 'https://martinfowler.com/articles/harness-engineering.html' },
    ],
  },
  {
    title: 'Runtime AI judges',
    category: 'Tooling',
    summary: 'Fig-4 /response-quality-sampling + /log-anomalies: inferential runtime monitors — theater without traffic; parked behind real users.',
    body: `The figure's inferential runtime pair: AI judges continuously sampling response quality and flagging log anomalies, feeding suggestions back to the agent unprompted. The most expensive sensors in the figure — GPU/NPU judgment, always on — and the least deterministic.

Status (2026-09): parked behind real users, no trigger defined beyond that. Without traffic there is nothing to sample and no baseline for "anomaly" to mean anything; a judge watching an idle local server would bill tokens to admire silence. If users ever arrive, response-quality sampling comes before log-anomaly (sampling answers "is it good", anomaly answers "is it weird" — goodness first).

Related out-of-scope kin: the Logs mod records the same verdict for the batch form.`,
    considered: true,
    implemented: false,
    wanted: false,
    tags: ['ai-judge', 'runtime', 'continuous', 'out-of-scope', 'inferential'],
    links: [
      { label: 'article — continuous feedback', url: 'https://martinfowler.com/articles/harness-engineering.html' },
    ],
  },
  {
    title: 'Mutation testing',
    category: 'Tooling',
    summary: 'The honest signal for suite strength (bugs planted, tests must fail): probed manually 4/4 killed; full tooling parked — no node:test runner exists and no mutant has survived.',
    body: `The most honest signal for a test suite's fault-detection: coverage tracks line execution, mutation introduces deliberate bugs and requires tests to fail when behavior breaks. An undetected mutation is a validation gap, not a coverage gap. Critical in the AI era, where high coverage can mask logically hollow, perpetually-green tests (missing assertions, decoupled mocks).

Manual probe, run live here (2026-09-10, all mutants reverted immediately):
1. slugify drops lowercase → killed (3 unit failures).
2. toView flag-flip (predicted survivor) → killed by the flag-mapping test.
3. Highlight-dimension drop → killed.
4. [LSP] bracket reintroduction → killed by the regression test.

Score 4/4 — the 22 tests genuinely validate; no hollow greens found.

Adopted for real (2026-09-15): the "no node:test runner" objection was wrong — Stryker's default command runner drives any shell command by exit code. stryker.config.mjs scopes runs to src/lib, manual and incremental (never in check — minutes per run). First real run: mods.ts 68.75%, and the regex-trimming survivors immediately earned trimming property tests. reports/ ignored as regenerable residue.`,
    considered: true,
    implemented: false,
    wanted: false,
    tags: ['mutation', 'tests', 'validation', 'deferred'],
    links: [
      { label: 'article — change lifecycle', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'StrykerJS', url: 'https://stryker-mutator.io/' },
    ],
  },
  {
    title: 'Dependency rules (dep-cruiser)',
    category: 'Tooling',
    summary: 'Sensors-article cross-file sensor: 4 layer rules (routes→lib→db, ops aside, extension isolated) green in check, plus a generated mermaid graph of the whole import tree.',
    body: `The sensors article's dependency-rules section: basic linting sees files, this sees across them — routes -> services -> clients + domain there, routes -> lib -> db here. Co-written config the same way (AI absorbs the syntax cost), error messages recap the layering for self-correction.

Rules (.dependency-cruiser.mjs, all error severity, all green day one — 47 modules, 80 deps, 0 violations):

1. **lib-no-routes** — logic stays UI-free (unit-testable, portable).
2. **db-inward-only** — persistence takes no app dependencies.
3. **ops-no-routes** — scripts/tests drive lib or HTTP, never pages.
4. **extension-isolation** — the pi extension imports node + pi API only (kit portability).

Stated blind spot: .astro frontmatter is unparseable, so page-side imports are invisible; the ts/js/mjs graph is fully covered. The generated map (docs/dependency-graph.mmd, 80 edges, validate-first regeneration) makes drift visible on demand.

**Thoughts:** this replaced structure-description prose with an enforced boundary — the kit/instance split finally has its fitness function. Parked trigger pulled early by explicit call; no second violation needed arguing.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['dep-cruiser', 'dependencies', 'layers', 'sensor', 'computational'],
    links: [
      { label: 'sensors article — dependency rules', url: 'https://martinfowler.com/articles/sensors-for-coding-agents.html' },
      { label: 'dependency-cruiser', url: 'https://github.com/sverweij/dependency-cruiser' },
      { label: 'generated graph', url: 'docs/dependency-graph.mmd' },
    ],
  },
  {
    title: 'Safeguards against AI missteps',
    category: 'Knowledge',
    summary: 'Böckeler’s safeguard list against LLM caprice (individual + team), quoted whole, with each item mapped to our control — the threat model our harness answers.',
    body: `From "The role of developer skills in agentic coding" (the failure-modes catalog the harness article maps its sensors against) — quoted whole, then mapped:

## Individual coder

- **Always carefully review AI-generated code.** It is very rare that I do NOT find something to fix or improve. → *Ours: implement step-6 read-back checklist; human-review ring stays, no autonomous merging.*
- **Stop AI coding sessions when you feel overwhelmed.** Revise the prompt and start fresh, or fall back to manual implementation ("artisanal coding"). → *Ours: Clarify-don't-guess principle; short sessions (the context caveat rewards fresh branches).*
- **Stay cautious of "good enough" solutions** created miraculously fast but carrying maintenance cost. → *Ours: Minimalism + review-checklist over-engineering read.*
- **Practice pair programming.** Four eyes catch more than two. → *Ours: the agent loop under human eyes is the pair; second-model review waits on trigger.*

## Team and organization

- **Good ol' code quality monitoring** (SonarQube/CodeScene; watch duplication harder now). → *Ours: the computational ring (typecheck, lint, semgrep, tests); duplication watched by review, no dedicated tool yet.*
- **Pre-commit hooks and IDE-integrated review — shift left.** → *Ours: npm run check pre-handoff + CI on push; the pipeline half now exists.*
- **Revisit practices; keep a "Go-wrong" log**, reflected on weekly. → *Ours: the decisions journal IS the log; the failure-ledger tripwire is the wanted automation.*
- **Make use of custom rules** (sent with every prompt — obeyed only probabilistically, worse in long sessions). → *Ours: AGENTS.md + skill rules, with the same caveat recorded; rules that can graduate become sensors.*
- **Culture of trust and open communication** — pressure to deliver "because AI" is itself a quality risk. → *Ours: single-human scale, but the warning stands against self-pressure to merge green-but-unread diffs.*

**Thoughts:** this list is the threat model; nearly every mod in this catalog is one of its answers. New safeguards should arrive the same way these did — quoted, then mapped, then built.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['safeguards', 'missteps', 'threat-model', 'review', 'culture'],
    links: [
      { label: 'role of developer skills', url: 'https://martinfowler.com/articles/exploring-gen-ai/13-role-of-developer-skills.html' },
      { label: 'harness engineering', url: 'https://martinfowler.com/articles/harness-engineering.html' },
    ],
  },
  {
    title: 'Coupling data',
    category: 'Tooling',
    summary: 'Sensors-article coupling experiment, built thin: TS-compiler fan-in/fan-out + cycles + blast radius via CLI, six-tab static dashboard as app tab — triage use, not judgment.',
    body: `The article's coupling-data experiment (custom TS-compiler tooling, web viz + agent CLI) rebuilt at our scale: scripts/coupling.mjs extracts per-file import + call edges for the 23 ts/js files.

Two faces, like hers:

1. **CLI for the agent** — hotspots (fan-in/fan-out), impact <files> (transitive blast radius for review triage), cycles, full JSON. Findings: db/client.ts + src/lib/mods.ts lead fan-in (6 each); zero import cycles.
2. **Dashboard for the human** — six static-SVG tabs (Structure, Coupling, Cohesion, Risk, Functions, Layers) at /docs/coupling/dashboard.html, linked as the Coupling tab in the app nav. Deliberately tables and bars, not DSM/force-graphs — her own verdict was that fancy viz doesn't reduce review load.

Verified against dependency-cruiser (same in-repo edge set). Stated limits: .astro invisible, call-edge resolution thin (the import graph carries the triage use). On demand during review, not a check gate.

**Thoughts:** her best line survives — data in service of attention (where to look hard), not judgment (no good/bad without appropriateness context, which lives outside the graph). The review-checklist impact line is the named next step.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['coupling', 'fan-in', 'triage', 'dashboard', 'sensor'],
    links: [
      { label: 'sensors article — coupling data', url: 'https://martinfowler.com/articles/sensors-for-coding-agents.html' },
      { label: 'live dashboard', url: '/docs/coupling/dashboard.html' },
    ],
  },
  {
    title: 'Modularity review (Balanced Coupling)',
    category: 'Workflow',
    summary: 'Khononov’s review/design skills adopted globally with a pi adapter: evidence-first (coupling CLI quoted before judgment), grilling-style interviews, reports to docs/.',
    body: `The sensors article's inferential payoff: AI modularity review with strong prompts (Balanced Coupling model — strength, distance, volatility + balance rule) found what coupling data alone could not, and run-twice surfaced different issues.

Adopted the way firecrawl/archify were (2026-09-15): upstream bodies live globally (~/.agents/skills/modularity, CC BY-NC-SA 4.0 verbatim + LICENSE), modularity-review + modularity-design symlinked into the harness, and .pi/skills/modularity/ adapts Claude-isms — AskUserQuestion → grilling rounds, TaskCreate → todowrite, evidence → scripts/coupling.mjs, reports → docs/.

Load-bearing rule from their lessons: numbers quoted before judgment, legitimate hubs acquitted in writing. Status: installed and wired, unrun — on probation until the first structural change or the 5-snapshot ritual triggers it.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['modularity', 'review', 'balanced-coupling', 'skills', 'inferential'],
    links: [
      { label: 'sensors article — AI modularity review', url: 'https://martinfowler.com/articles/sensors-for-coding-agents.html' },
      { label: 'modularity repo', url: 'https://github.com/vladikk/modularity' },
      { label: 'balanced coupling', url: 'https://coupling.dev' },
    ],
  },
  {
    title: 'Definition of Done',
    category: 'Workflow',
    summary: 'Lecture-01 rule: every task ships with completion criteria a command can verify — no vibes-based done.',
    body: `Without an explicit Definition of Done, the agent invents its own ("looks fine") — the verification gap, the most common failure mode. Standing gates (CI, lint, typecheck) are not enough; each task needs its own completion criteria, verifiable by command where possible.

The form: state Done-means before starting, declare done only when a command confirms it. Canonical example — spell it out, don't say "add a search feature":

> Completion criteria:
> - New endpoint GET /api/search?q=xxx
> - Supports pagination, default 20 items
> - Results include highlighted snippets
> - All new code passes pytest
> - Type checking passes (mypy --strict)

Each line names something a command can confirm. Translate the runners to your stack — whatever test runner, typechecker, and contract assertions you use. The form is the point, not the tools.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['definition-of-done', 'completion', 'verification', 'workflow'],
    links: [
      { label: 'lecture 01', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-01-why-capable-agents-still-fail/' },
    ],
  },
  {
    title: 'Verification gap log',
    category: 'Tooling',
    summary: 'Lecture-01 exercise as instrument: sample tasks, record claimed-done vs actually-done — the one metric for whether verification works.',
    body: `After each task, record whether the agent claimed completion, then verify independently. The proportion of false-dones is your verification gap — the single number that says whether the verification layer functions.

Start manual: one log line per task (claimed-done + independent verdict), gap ratio over a window, beginning with any task where "done" felt cheap. Instrument later: append results automatically from your checks, review the ratio on a cadence, and treat a widening gap as the signal to strengthen verification. This sensor reports on the sensors themselves — build it the day a false-done slips through green.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['verification-gap', 'metrics', 'validation'],
    links: [
      { label: 'lecture 01', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-01-why-capable-agents-still-fail/' },
    ],
  },
  {
    title: 'Context-anxiety discipline',
    category: 'Knowledge',
    summary: 'Lecture-01 failure mode: agents rush and skip verification when context runs low — watch the tokens, restart fresh, never economize on checks.',
    body: `When agents sense context running low, they rush to finish — skipping verification, choosing simple over optimal. Name context anxiety as a failure mode rather than suffering it as bad luck.

Discipline: track context usage per turn so the pressure is visible; prefer a fresh session over pushing a long one; treat compaction summaries as lossy by design — re-verify, don't trust; verification steps are never the thing to cut to "save" context. Optionally automate the nudge: warn when a session's context passes a threshold and suggest a restart.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['context', 'sessions', 'verification', 'discipline'],
    links: [
      { label: 'lecture 01', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-01-why-capable-agents-still-fail/' },
    ],
  },
  {
    title: 'Sensors sidecar',
    category: 'Tooling',
    summary: 'Her continuous daemon, adopted whole: 6 fast sensors on intervals with native/default parsers, agent summary via sensors check; heavies excluded, Stryker triggered.',
    body: `The sensors article's appendix made real: birgitta410/sensors-cli (uv-installed) running typecheck/lint/semgrep/structure/unit/secrets on 60–120s intervals, with her human HUD and the token-efficient agent summary (sensors check) as the two faces.

Shape of the adoption:

- **Native parsers where they exist** — eslint/semgrep/depcruise run stock machine-readable commands; everything else through one generic default-parser wrapper (exit code is the verdict). No per-sensor parser code written.
- **Fast slices only** — browser flows, HTTP suite, and Stryker stay out (server + minutes; check/CI territory). Stryker reads the last report on a 5-minute interval (cheap cat; expensive runs manual via npm run mutate, which stops the sidecar first — its socket breaks Stryker sandboxes).
- **Config + wrapper tracked** (.sensors/harn.sensors.yaml); runtime state ignored by the tool's own .gitignore. Tool configs stay at root (declined her move-under-.sensors convention — check, CI, and docs reference root paths).
- **Frictions resolved:** Mac-only tool boots on Linux; config mode is triggered not trigger (worker mode shows the real error).

**Thoughts:** check remains the gate (one-shot, authoritative); the sidecar is situational awareness between gates. The history files it accumulates are the future failure ledger — the tripwire proposal finally has real data to stand on.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['sidecar', 'continuous', 'sensors', 'daemon'],
    links: [
      { label: 'sensors article — appendix', url: 'https://martinfowler.com/articles/sensors-for-coding-agents.html' },
      { label: 'sensors-cli', url: 'https://github.com/birgitta410/sensors-cli' },
    ],
  },
  {
    title: 'Observability',
    category: 'Tooling',
    summary: 'Single-process analogue of the per-worktree stack: JSONL access log + Prometheus metrics + trace ring with request IDs — no daemons, queryable today.',
    body: `Their Victoria logs/metrics/traces + LogQL/PromQL, rebuilt at local scale with zero dependencies (src/lib/observability.ts):

- **LOGS:** JSONL access log (data/access.log, gitignored) — every request with trace id, timing, checkpoints. Grep/jq-able; Vector could tail it later.
- **METRICS:** Prometheus text at /api/metrics — request counts, avg/p50 durations, by-status and top-path families. Scrapeable if a TSDB ever arrives.
- **TRACES:** X-Request-Id on every response, checkpoints in list handlers, last-200 ring at /api/traces. Middleware starts/finishes all traces; observability never fails requests.

**Thoughts:** challenged as overkill, built to see — verdict: the JSONL log earns its keep immediately (what 500'd, what did the session hit); metrics/traces are cheap ballast until a latency question or second process arrives. Process-lifetime memories reset on dev reload (stated). Thin tests pin all three seams.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['observability', 'logs', 'metrics', 'traces'],
    links: [
      { label: 'OpenAI harness engineering', url: 'https://openai.com/index/harness-engineering/' },
      { label: 'live metrics', url: '/api/metrics' },
      { label: 'live traces', url: '/api/traces' },
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

Dev-mode caveat: npm run dev emits Vite dev-toolbar 504s in headless runs — expect-error-free is meaningful against the prod build (npm run preview), which check self-serves.

Sensor record (2026-09, Fig 2 Browser row): this is the backstop of the Real-browser-usability CfR, which exists because scripted clients lie. Hygiene: per-run check-*.png screenshots are untracked noise (ignored); curated qa-* evidence stays committed. The --help usage line now lists every flag. Opencode-era upgrade, free: with a vision-capable model the agent can actually look at the screenshots — same sensor, strictly stronger reader.`,
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
    title: 'Language servers (astro check)',
    category: 'Tooling',
    summary: 'Deterministic code intelligence as a batch sensor: astro check type-checks the whole repo in npm run check — the control astro build pretended to be.',
    body: `The article's Language Servers guide (computational): ground-truth code intelligence — types, signatures, definitions, references, diagnostics — steering the agent before it writes. The same engine run after a change is a sensor; placement decides the role.

**The audit finding that earned this mod:** npm run check ran astro build… which does NOT type-check TypeScript (esbuild strips types without checking). The typecheck sensor we thought we had did not exist — a type error in src/lib sailed through build and check.

Decision (2026-09): astro check (the TS/Astro language engine in CLI mode) chained into npm run check (build → typecheck → secrets scan → behaviour flows). DevDeps: @astrojs/check + typescript@6. First run: 1 real error (unknown catch binding in C4Diagram.astro) — fixed; now 0 errors / 0 warnings.

*Gotcha:* TypeScript 7 (the new native compiler) does not expose the programmatic API astro check needs — pin typescript@6.x until Astro supports it (docs.astro.build, withastro/roadmap#1321).

**Interactive form landed (2026-09, pi-only):** \`.pi/extensions/lsp-diagnostics/\` speaks LSP over stdio to \`typescript-language-server\` and appends \`[LSP]\` receipts to edit/write/bash tool results (silent when clean) + a \`diagnostics\` on-demand probe — the true guide placement. It needs pi's ExtensionAPI, so under opencode it does not execute; the batch sensor above is the portable cover. Protocol review: docs/LSP — review and integration.md. Open hardening: a hook crash is byte-identical to "clean" (needs a distinct failure note).`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['typecheck', 'lsp', 'sensor', 'typescript', 'computational'],
    links: [
      { label: 'astro check docs', url: 'https://docs.astro.build/en/reference/cli-reference/#astro-check' },
      { label: 'TS 7 API gap (roadmap#1321)', url: 'https://github.com/withastro/roadmap/discussions/1321' },
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
  {
    title: 'CLIs + scripts',
    category: 'Tooling',
    summary: 'Deterministic commands behind skill wrappers — the portable computational guides: same bash in pi and opencode.',
    body: `The article's CLIs/scripts guide (computational feedforward): deterministic tooling the agent invokes before/during generation instead of guessing. Its endorsed shape is the hybrid — "skill with instructions and a bootstrap script", rated Both computational and inferential — which is exactly our inventory:

1. **firecrawl CLI** (web facts) — search/scrape/crawl behind the skill family, with cost guards (--limit caps, top hits only, outputs to .firecrawl/ not the context window).
2. **archify CLI** (diagrams) — typed JSON in, validate → deliver, 9-gate receipt out.
3. **browser-qa qa.mjs** (behaviour evidence) — --json / --assert / --eval / --login / --shot.
4. **npm scripts + scripts/*.mjs** — the pre-handoff gate (npm run check) and harness-ops one-shots (seed, export/import, secrets scan).

Three placements: mid-loop via bash (facts, diagrams, browser evidence), check as the left-shifted gate, one-shot harness ops with exact commands + expected receipts (docs/Harness how-tos.md).

**Portability rule (earned in the pi → opencode move):** CLIs run through bash, which both harnesses have — they are the one guide category that survives the switch unchanged, unlike pi-only extensions. New controls ship as skill + script first.

**Named gaps:** qa.mjs --help omits real flags (--eval, --login); no structural linters (eslint/semgrep ring — deferred at this size); Firecrawl budget has no sensor (proposal: warn-only --status line).`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['cli', 'scripts', 'feedforward', 'guides', 'receipts', 'portable'],
    links: [
      { label: 'article — guides', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'our review (fig 2)', url: 'docs/Harness review — feedforward guides.md' },
    ],
  },
  {
    title: 'Code mods',
    category: 'Tooling',
    summary: 'Deterministic program transforms (OpenRewrite-style recipes) — reviewed and deliberately deferred: no codemod tooling at this size, with a trigger rule instead.',
    body: `Fig 2's last feedforward guide (computational): deterministic program transformations — AST rewrites, migration recipes, scaffolders — that put code in the desired shape without LLM judgment. The agent says "apply recipe X" instead of hand-editing dozens of files probabilistically.

**Status: verified gap, not neglect (2026-09).** Grep finds only the word "codemods" in the article-summary doc; no jscodeshift / recast / OpenRewrite / scaffolders anywhere. Rationale: ~30-file single-user tool — every candidate change is rare and reads better as a reviewed hand-edit (Minimalism; the Performance/scalability CfR explicitly forbids over-engineering here).

**Trigger rule instead of tooling:** the third occurrence of the same mechanical multi-file edit gets encoded as a script, shipped in skill + script form (see the CLIs + scripts mod). Named candidates: seed-mirror generation, repetitive Astro/API-route scaffolding, the TS 6→7 pin flip.`,
    considered: true,
    implemented: false,
    wanted: false,
    tags: ['codemods', 'feedforward', 'guides', 'deferred'],
    links: [
      { label: 'article — guides', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'OpenRewrite recipes', url: 'https://docs.openrewrite.org/' },
    ],
  },
  {
    title: 'Static analysis',
    category: 'Tooling',
    summary: 'Deterministic checks on every change (Fig 2 first sensor row): build + strict typecheck + secrets scanner + eslint/semgrep, with a thin HTTP suite and unit-covered lib core as the behavioural backstop.',
    body: `Fig 2's first sensor row (computational feedback): deterministic, millisecond-to-second checks on every change so the agent self-corrects before human eyes — with signals optimised for LLM consumption ("positive prompt injection").

Layers, all in npm run check:

1. **astro build** — compile gate (esbuild strips types; checks nothing semantic).
2. **astro check** — strict typecheck (astro/tsconfigs/strict); 0 errors / 0 warnings.
3. **check-secrets.mjs** — the exemplar: 6 credential patterns over git-tracked files, file:line + fix, value never printed. Caught a live .env push on its first run.
4. **eslint** (flat config, recommended minus tsc-covered noise) + **semgrep** (2 earned rules: no absolute-local fetch, no eval).

Behavioural backstop (the Fig 3 coverage ring, honestly scoped):

- **Thin suite** (test/, 12 tests, zero deps) — node:test + fetch mirror the 4 browser flows computationally, incl. the Accept-header and Origin-header lessons, plus fuzz probes (hostile input never 500s). Env-gated login paths sign out after.
- **Unit coverage** (test/lib.test.mjs, 15 tests) — pure core (c4/mods/context) with real per-file lines, incl. the bracket regression and seeded slugify property cases; black-box HTTP coverage proven unmeasurable on this server (V8 data exists but Astro's bundles don't attribute), thresholds off until earned.

Explicitly parked: **mutation testing** (trigger: ~30 tests or a slipped seam). dep-cruiser graduated 2026-09-10 (trigger pulled early): 4 layer rules green in check.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['static-analysis', 'sensor', 'tests', 'coverage', 'computational'],
    links: [
      { label: 'article — sensors', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'suite runner', url: 'scripts/qa-flows.mjs' },
    ],
  },
  {
    title: 'Review agents',
    category: 'Tooling',
    summary: 'Semantic judgment after the act (Fig 2 inferential sensor): the implement self-review formalized into a read-back checklist; second-model and janitor review deferred with triggers.',
    body: `Fig 2's inferential (semantic) feedback sensor: a model re-reading code for what deterministic checks cannot see — misdiagnosis, over-engineering, wrong slice, spec mismatch. The article rations it by cost (/code-review every change, /architecture-review rarely) and warns contradictory signals need a tiebreaker (our Principles).

Status here was one unritualized line (implement step 6, "read it as a reviewer would") — same model, same window, no checklist. Earned evidence it was insufficient: the [LSP] mermaid-bracket bug sailed through it and was caught by a computational sensor instead.

Formalized, not expanded (2026-09): step 6 is now a 5-point read-back — minimalism · scope · CfRs · catalog mirror · receipts — same cost, actual teeth. No second model, no new skill.

Deferred with triggers: second-model spot review on risky diffs (auth, migrations, map) after the next semantic slip past the checklist; janitor/GC agents — nothing here drifts at army scale.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['review', 'sensor', 'inferential', 'self-review'],
    links: [
      { label: 'article — sensors', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'implement skill', url: '.pi/skills/implement/SKILL.md' },
    ],
  },
  {
    title: 'Logs',
    category: 'Tooling',
    summary: 'Runtime output as feedback (Fig 2 computational sensor): per-run browser console capture gated in check; server logs informal by decision; continuous anomaly detection out of scope.',
    body: `Fig 2's computational log sensor plus the Fig-4 continuous form (/log-anomalies judges, SLO monitors): runtime output observed after the act.

What it is here (2026-09):

1. **The sensor already exists per-run** — browser-qa captures console errors/warnings, page errors, and failed requests on every check run, gated with the rest. No new infrastructure; just the name on what we do.
2. **Server logs informal by decision** — process stdout with machine-readable one-line receipts in scripts. No structured logging, no viewer; single-user local scale owes none.
3. **Hygiene earned twice now** — dev.log + prod.log were git-tracked though nobody reads them (same accident class as the .env push: tracked files override gitignore). Untracked, *.log ignored; local process output is never committed.

Explicitly out of scope: continuous log-anomaly judges — no runtime users, no SLOs. Revisit if this ever serves anyone but us.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['logs', 'sensor', 'console', 'computational'],
    links: [
      { label: 'article — sensors', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'check flows (runner)', url: 'scripts/qa-flows.mjs' },
    ],
  },
  {
    title: 'Steering loop',
    category: 'Workflow',
    summary: 'The human iterates the harness on recurrence (our Principle 9); the loop is human-triggered today — an automatic repetition tripwire is the wanted upgrade.',
    body: `The article's steering loop: whenever an issue recurs, improve the controls so it gets less probable — and use AI to build those controls (draft rules, scaffold linters, how-tos from archaeology). This repo is the loop running: secrets incident → secrets scanner, invisible rule → AGENTS.md rule, bracket bug → unit test, daemon leak → preview-stop fix. The decisions doc is the loop's journal.

Gap: the loop is human-triggered — recurrence is noticed by a person, then encoded. Nothing counts repetitions, so the "second occurrence" (lint) and "third occurrence" (codemod) triggers assume someone is counting.

Proposed mechanism (wanted, ~1 hour, zero deps): a failure ledger — check appends each sensor failure as one JSONL line (date, step, class, file) to data/failures.jsonl — plus a warn-only scripts/steering-review.mjs that counts classes in a window and prints rule candidates ("login flow failed 3rd time in 14 days — encode the bar?"). Thresholds mirror the existing rules (2 for lint-class, 3 for mechanical edits). Warn-only until the signal proves itself; a tripwire that cries wolf trains disregard, same as a noisy sensor.

Diagnose by layer (Lecture 01): don't just say "the model isn't good enough." Work through the five layers systematically — task not clearly defined, insufficient context, misconfigured environment, missing verification, loss of state between sessions. Attribution first, fix second: each layer points at a different control (spec, context budget, env parity, check gates, session discipline), and guessing the layer is how fixes land in the wrong place.`,
    considered: true,
    implemented: true,
    wanted: true,
    tags: ['steering-loop', 'meta', 'repetition', 'tripwire'],
    links: [
      { label: 'article — steering loop', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'lecture 01 — five layers', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-01-why-capable-agents-still-fail/' },
      { label: 'decisions journal', url: 'docs/Harness decisions.md' },
    ],
  },
  {
    title: 'Progress file',
    category: 'Workflow',
    summary: 'Lecture-02 state subsystem: done / in-progress / blocked in one small file — the handoff each session writes to the next.',
    body: `Long tasks die between sessions: the next session inherits files but not intent. Keep one small progress file at a fixed path: what is done, what is in progress, what is blocked. Update it before each session ends; read it when the next one starts.

Fixed shape, tiny, always current — the handoff the agent writes to itself. Complements session hygiene (fresh restarts, distrusted summaries): hygiene keeps sessions cheap, the progress file keeps the work continuous.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['progress', 'state', 'sessions', 'continuity'],
    links: [
      { label: 'lecture 02', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-02-what-a-harness-actually-is/' },
    ],
  },
  {
    title: 'Five-subsystem audit',
    category: 'Workflow',
    summary: 'Lecture-02 ritual: score instructions/tools/environment/state/feedback 1–5, fix the lowest — harnesses rot like code.',
    body: `Score the five harness subsystems — instructions, tools, environment, state, feedback — 1 to 5. Fix the lowest first; thirty focused minutes beats another round of model-swapping.

Repeat on a cadence, because harnesses rot like code: instructions drift from reality, checks bit-rot, state files go stale. Treat the gap list as harness debt and pay it down like tech debt — the scheduled counterpart to fixing whatever just recurred.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['audit', 'harness-debt', 'review'],
    links: [
      { label: 'lecture 02', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-02-what-a-harness-actually-is/' },
    ],
  },
  {
    title: 'Harness ablation test',
    category: 'Tooling',
    summary: 'Lecture-02 experiment: remove one component at a time, measure the drop — ranks value, but only attribution finds bottlenecks.',
    body: `To rank what actually matters, remove one harness component at a time — instructions, feedback, state — and measure the performance drop on a fixed task with a fixed model. Biggest drop wins your attention next.

Caveat that makes it honest: ablation ranks marginal value, it does not locate bottlenecks. Pair every removal with failure attribution (unclear task? thin context? broken env? missing verification? lost state?) — only the attribution says where the bottleneck lives.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['ablation', 'experiment', 'attribution', 'metrics'],
    links: [
      { label: 'lecture 02', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-02-what-a-harness-actually-is/' },
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