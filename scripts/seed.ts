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
    body: `Skills follow the Agent Skills standard: a directory with a SKILL.md, discovered from global and project-level locations. Descriptions are injected into the system prompt; full instructions load on demand.

Keep the set small and curated, and prefer project-level skills so they version with the project. Global skills suit personal workflows; anything the project depends on lives in the repo.

Specialize by role (Day-2 paper): one agent with every tool attached hits the monolithic ceiling — huge search space breeds hallucinated calls, full-context prompts dilute attention, one bad instruction corrupts everything. Give each role a narrow tool subset and a focused prompt (reduction of search space, sharper reasoning, clean signal-to-noise); the orchestrator routes instead of reasoning over the whole tree.

Authoring discipline (Day-3 paper): skills are procedural memory — not what happened (episodic) or facts (semantic) but how to do things step by step. Three levels load progressively: metadata always in context, SKILL.md body on trigger, bundled resources strictly as needed — a hundred skills cost a hundred metadata lines. The description is the routing algorithm (the only thing the model sees when deciding): front-load trigger keywords, state what it is NOT for, be pushy if it under-triggers. Name boringly (no utils/tools/jargon). Split the folder by need: deterministic work in scripts/, on-demand knowledge in references/, templates in assets/ — a growing SKILL.md means the next paragraph belongs in references/. Two paths create them: translate existing runbooks (experts need no code), or crystallize a successful agent run (agent drafts, human reviews — unreviewed drafts are worse than none). Test both directions: fires when it should, stays quiet when it shouldn't.

Production readiness (Day-3 paper): past prototype, the model stops being the interesting part — skills become the engineering primitive that ships reliably. The full lifecycle arrives as skills that compose into the existing tool, not another portal: scaffold, code, eval, deploy, publish, observe.

![One install of lifecycle skills into any coding agent](/uploads/565b6fe5-9f26-46b4-a4c2-421614890ebd.png)

Three properties make skills the unit of improvement: conditional (loaded only on description match), composable (chaining downstream tools without mutual knowledge), owned (versioned folders with authors, improvement distributed). Compare against the alternatives:

![Improvement methodologies: model swap, prompt edit, fine-tune, new skill](/uploads/a534a124-53ef-41d6-a144-9e80cfa960e9.png)

New skills win on cycle time (hours to days), blast radius (bounded to matching turns), ownership (any domain team), and context tax (dynamic, on-demand). Inside any agent runtime, incidentally, barely any code is reasoning — the overwhelming share is operational infrastructure (permissions, compaction, delegation, storage). As models converge, the deterministic engineering around them is the differentiator, and the skill is its composable unit.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['skills', 'context'],
    links: [
      { label: 'Agent Skills spec', url: AGS },
      { label: 'Pi skills repo', url: 'https://github.com/badlogic/pi-skills' },
      { label: 'SDLC paper — dynamic pattern', url: 'https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding' },
      { label: 'Day-2 paper — specialization', url: 'https://www.kaggle.com/whitepaper-agent-tools-and-interoperability-with-mcp' },
      { label: 'Day-3 paper — authoring', url: 'https://www.kaggle.com/whitepaper-agent-skills' },
    ],
  },
  {
    title: 'Skill evaluation',
    category: 'Knowledge',
    summary: 'Day-3 method: four failure modes, five-pattern toolkit, trigger gate, trajectory scoring — a skill without a test is a hope.',
    body: `A skill without a test is a hope, not a capability. Benchmarks show nearly one in five skills performing worse with the skill than without — poorly designed skills actively degrade capability. The failures are predictable, in four modes: trigger failure (wrong skill fires, or the right one doesn't), execution failure (correct trigger, wrong output or errant tool calls), token budget failure (a massive body crowding the window, degrading unrelated turns), and regression (a new skill overlapping an old one, breaking working routing). Single-turn failures surface in routing logs and output quality; budget and regression failures only appear when the full library runs together under load.

![Four skill failure modes: trigger, execution, token rot, regression](/uploads/2c92c274-9c15-4913-9fdc-8191a96500e9.png)

Five complementary testing patterns cover the surface: eval-as-unit-test (skill test files in CI, every change), golden dataset (curated versioned input-output pairs with the skill), LLM-as-judge (peer-model rubric scoring at scale), adversarial red-teaming (probing designed to expose failure), canary/shadow mode (controlled traffic before full rollout).

![Evaluation toolkit: five testing patterns across the failure surface](/uploads/dae8ca45-b0c4-4d83-b724-7337cd33d517.png)

The trigger is the first gate: a skill that never fires cannot help, and one firing too broadly injects irrelevant context. Production analyses show non-invocation rates above half for skills expected to fire consistently — and a stripped skill scoring below no-skill at all, proving bad skills subtract capability. Target 90% trigger accuracy: every description passes testable specificity (three positive and three negative triggers), clarity (no overlap with adjacent skills), execution fidelity (describes actual performance, not aspiration), and rephrasing stability (routes the same however the intent is phrased).

![Evaluation gate pipeline: unit tests, golden data, judge, probing, production split, canary/shadow](/uploads/8adc9d26-ecf9-41e2-9284-e67441cccf0d.png)

Test output and trajectory separately: what the agent says versus what it does. Evaluation-driven development inverts the workflow — write the eval cases (input, expected tools, expected output) before drafting the skill, forcing the functional spec upfront. LLM-as-judge at scale has two non-negotiables: swap reference and actual positions to kill ordering bias, and calibrate against human ratings to 90% agreement. Output-only scoring passes significantly more cases than trajectory-aware scoring — the gap is correct answers reached via incorrect tool sequences, acceptable read-only, critical where actions have irreversible side effects. Match trajectory strictness to the skill tier: exact order, ordered subset, or unordered subset.

![Trajectory scoring modes and the output-only blind spot](/uploads/efc37763-fbbb-4ef5-b755-0df2fef00650.png)

Beware the evaluation illusion: trajectory testing grades the composite system — host agent plus skill — not the skill alone. When a multi-skill trajectory fails, routing, instruction quality, and execution fidelity blur together. Calibrate simply: single-skill sub-agent versus base agent, and save multi-skill co-loading for advanced staging. If a test fails, don't over-fit SKILL.md to one model and ruin portability — isolate tool code from routing with a two-tiered assert (tools validated independently, triggers audited across model families).

Evaluation-driven development inverts the workflow: write the eval cases (input, expected tools, expected output) before drafting the skill, forcing the functional spec — and its ambiguities — upfront:

\`\`\`json
{
  "case_id": "refund_dup_charge_001",
  "input": "I was charged twice for order #4521 last Tuesday",
  "expected_skill": "refund_processor",
  "expected_tool_calls": [
    { "tool": "lookup_order", "args": { "order_id": "4521" } },
    { "tool": "check_duplicate_charge", "args": { "order_id": "4521" } }
  ],
  "expected_output_format": "confirmation_with_refund_id",
  "rubric": ["acknowledges duplicate", "cites order id", "provides next step"]
}
\`\`\`

Never evaluate purely in isolation — production co-loads many skills at once, and a body that passes alone can rot everything together. Isolation accuracy near 90% can collapse toward 40% under co-loaded context noise: passing alone is a false positive for production readiness.

![Isolated skill accuracy versus co-loaded production accuracy](/uploads/223dfe8e-34a6-4d63-882b-a184eb7e0095.png)

Graduate through strict tiers of authority. Read-only: judge eval plus 90% trigger accuracy. Draft-only (human review): golden dataset of 20+ cases plus human approval. Action-allowed: full adversarial red-teaming, sustained success across runs — never a single lucky pass — no rollback events, sustained pass^k (success on every one of k runs; single-run success predicts production reliability poorly). Discount the numbers on the way in: production typically drops a fifth to a third off offline pass@1, and simulation-based evals carry up to ~9% optimistic bias. Human review of representative outputs remains the final validation signal.

Eval coverage means four conditions, one per failure mode: triggers verified both directions (should fire, should not), outputs correct across representative inputs, zero regression on the existing library, token footprint bounded. Any single failure holds the skill in draft tier regardless of happy-path performance.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['skills', 'evaluation', 'trajectory', 'testing'],
    links: [
      { label: 'Day-3 paper', url: 'https://www.kaggle.com/whitepaper-agent-skills' },
    ],
  },
  {
    title: 'Archify — validated architecture diagrams',
    category: 'Tooling',
    summary:
      'Agent skill turning codebases/descriptions into polished interactive HTML system maps (typed JSON IR + 9-gate showcase validation).',
    body: `An agent skill that turns codebases or plain-language descriptions into polished, interactive HTML architecture maps: the agent authors a typed JSON IR (architecture / workflow / sequence / dataflow / lifecycle schemas), the tool validates it against presentation gates (edge crossings, label clearance, readability) and returns machine-readable repair receipts, then delivers one self-contained HTML artifact plus export formats.

The discipline worth borrowing: delta/compare receipts (added / removed / changed / moved per revision, nothing inferred) — the same receipt shape versioned snapshots want.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['architecture', 'diagrams', 'skills', 'validation'],
    links: [
      { label: 'repo · tt-a1i/archify', url: 'https://github.com/tt-a1i/archify' },
      { label: 'Day-2 paper — intent catalog', url: 'https://www.kaggle.com/whitepaper-agent-tools-and-interoperability-with-mcp' },
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
    body: `Prompt templates give the model recurring instructions beyond the system prompt and entry file — repeatable non-project workflows (release notes, changelog entries, review passes).

The entry file already covers project ground; templates cover workflows. Keep one or two; over-engineering risk is high.`,
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
    body: `Point the harness at a custom model provider through configuration — switching providers is config-only, no code changes.

Credentials belong in the environment or a secret store, never in the repo. Worth a second provider once there is a clear workload, for cost comparison and fallback.`,
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
    body: `The harness keeps a registry of available providers and models with one selected default. Model choice is the highest-leverage lever on output quality — track result quality per model when comparing candidates, and change the default deliberately, not by drift.`,
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
    body: `The harness reads environment variables for model/session context and runtime settings — invisible but everywhere.

Document every variable the project actually depends on in the entry file. Undocumented env dependence is implicit knowledge, and implicit knowledge is what agents trip over.`,
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
    body: `The core config file holds defaults — provider, model, harness options. It is the single source of truth for which model the harness uses: keep it minimal, reviewed, and under version control where possible.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['config'],
    links: [{ label: 'npm package', url: NPM }],
  },
  {
    title: 'AGENTS.md',
    category: 'Knowledge',
    summary: 'Entry file agents read automatically — a router (overview, commands, hard constraints, topic links), not an encyclopedia.',
    body: `AGENTS.md is a standard Markdown file at repo root that coding agents parse automatically. Its job is routing, not containing: 50–200 lines with a project overview, first-run commands, no more than ~15 non-negotiable hard constraints, and links to topic documents — each link with a one-line applicability condition ("required when…"). Nested files allow per-subproject instructions; nearest wins.

Anything that must stay in the entry goes at the top or bottom, never the middle — models use the extremes of long texts far better than the center. Everything else moves to topic documents, read on demand. Canonical shape:

\`\`\`markdown
# AGENTS.md

## Project Overview
Python 3.11 FastAPI backend, PostgreSQL 15 database.

## Quick Start
- Install: \`make setup\`
- Test: \`make test\`
- Full verification: \`make check\`

## Hard Constraints
- All APIs must use OAuth 2.0 authentication
- All database queries must use SQLAlchemy 2.0 syntax
- All PRs must pass pytest + mypy --strict + ruff check

## Topic Docs
- API Design Patterns (\`docs/api-patterns.md\`) — Required reading when adding endpoints
- Database Rules (\`docs/database-rules.md\`) — Required when modifying database operations
- Testing Standards (\`docs/testing-standards.md\`) — Reference when writing tests
\`\`\`

Keep it alive: update it whenever commands or conventions change, and prune it like a dependency list — unused entries slow the whole system down. Close the loop with a short skill catalog at the bottom: entry file stays tight while advertising what the skills library holds, so the router points at on-demand depth.

The entry points at a laid-out knowledge store, not a pile. Canonical layout — index files at every level, active/completed plans versioned beside tech debt, generated artifacts separated from written ones:

\`\`\`text
AGENTS.md
ARCHITECTURE.md
docs/
├── design-docs/
│   ├── index.md
│   ├── core-beliefs.md
│   └── ...
├── exec-plans/
│   ├── active/
│   ├── completed/
│   └── tech-debt-tracker.md
├── generated/
│   └── db-schema.md
├── product-specs/
│   ├── index.md
│   ├── new-user-onboarding.md
│   └── ...
├── references/
│   ├── design-system-reference-llms.txt
│   ├── nixpacks-llms.txt
│   ├── uv-llms.txt
│   └── ...
├── DESIGN.md
├── FRONTEND.md
├── PLANS.md
├── PRODUCT_SENSE.md
├── QUALITY_SCORE.md
├── RELIABILITY.md
└── SECURITY.md
\`\`\``,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['context', 'docs', 'router', 'entry-file'],
    links: [
      { label: 'agents.md spec', url: AGS },
      { label: 'lecture 04', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-04-why-one-giant-instruction-file-fails/' },
      { label: 'Day-3 paper — router catalog', url: 'https://www.kaggle.com/whitepaper-agent-skills' },
    ],
  },
  {
    title: 'Principles',
    category: 'Knowledge',
    summary: 'Durable value statements the agent applies with judgment — the top inferential feedforward guide (they outrank other guidance on conflict).',
    body: `Principles are the top layer of the Guides stack: short, durable value statements the agent must **interpret**, not mechanically follow — that's why they're inferential. Distinct from Rules (checkable constraints), Ref Docs (facts), and How-tos (procedures); principles are the tiebreaker when rules conflict or a situation is ambiguous.

Shape: a labeled block in the entry file, read every turn — e.g. minimalism (only the code the problem needs), surgical edits (touch only what the task requires), verify-before-done, secrets-via-env. Extract them from unlabeled instruction prose; implicit values don't steer.`,
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

Handling (the article-endorsed move): translate CfRs into architectural building blocks or **testable acceptance criteria** — guides (feedforward) plus fitness-function tests (feedback). Some CfRs graduate to computational sensors that run on every check. Shape: a short labeled list in the entry file — e.g. security (secrets via env, origin checks), data integrity (idempotent migrations, no silent rewrites), environment portability (verify in real conditions, not just dev), real-browser usability (served URLs work in browsers, not just scripted clients).

State them outright: de-facto quality bars learned from incidents stay invisible until written down, and the agent only considers what is fed forward.`,
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

Practices that hold: an index in the entry file (each doc with its when-to-read purpose, visible every turn); the single-source rule (ref docs link to systems of record, never copy drifting facts); verification stamps (mark when a doc was last confirmed current); and a doc-gardener (OpenAI) — a recurring pass, human or agent, that scans for documentation contradicting actual code behavior and opens fix-ups, with linters validating cross-links and structure mechanically. A stale ref doc actively misleads; an invisible one never helps.`,    considered: true,
    implemented: true,
    wanted: false,
    tags: ['ref-docs', 'docs', 'feedforward', 'guides', 'index'],
    links: [
      { label: 'article — guides', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'our review (fig 2)', url: 'docs/Harness review — feedforward guides.md' },
      { label: 'OpenAI — doc-gardening', url: 'https://openai.com/index/harness-engineering/' },
    ],
  },
  {
    title: 'Architecture doc (architecture.md)',
    category: 'Knowledge',
    summary: 'The Fig-3 feedforward guide for the app itself: routes, pipeline, data, earned gotchas — the buddy the agent reads before changing any route/table/flow.',
    body: `A curated map of the system under work — routes/endpoints with handlers and auth levels, the request pipeline (middleware, gates, header discipline), the data model and its rules, earned gotchas marked do-not-regress, and where each area's behaviour is proven. Distinct from harness docs (how the agent setup works); this one describes the app itself.

The agent reads it before changing any route, table, or flow. Shape over content: tables beat prose for endpoints, pipelines read top-to-bottom, gotchas are pinned by tests so they can't silently rot. An entry-file architecture sketch that misses half the routes is the coherence failure live — one buddy doc, single-sourced, indexed where the agent looks every turn.

Who holds the pen (SDLC paper): architecture stays the most human phase — trade-offs (consistency vs availability, complexity vs flexibility, build vs buy) rest on business context, org constraints, and strategy no model fully grasps. Agents excel at implementing decided architecture: scaffolding, consistent patterns, conformance to conventions. The doc records human-made structural decisions; the agent works inside them, never re-deciding them silently.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['architecture', 'ref-docs', 'feedforward', 'guides'],
    links: [
      { label: 'article — change lifecycle', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'the buddy', url: 'architecture.md' },
      { label: 'SDLC paper — human trade-offs', url: 'https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding' },
    ],
  },
  {
    title: 'How-to-test',
    category: 'Knowledge',
    summary: 'The Fig-3 feedforward testing guide: how-tos §5 plus the executable suite — doc, tests, and norm agreeing on what green looks like.',
    body: `Instructions telling the agent how the project tests, before it writes — seams, commands, what green looks like, how to read failures.

Complete in three layers that agree with each other:

1. **Doc** — exact commands, expected receipts, per-step failure table (so a failing seam sends the reader somewhere, not nowhere).
2. **Executable** — HTTP seam tests plus unit tests over the pure core, both inside the project's check command.
3. **Norm** — the entry file's testing section plus TDD steps in the implement workflow, with mid-loop and full commands spelled out.

Doc, executable, and norm agreeing is rare enough to state outright — most repos have two of three, and the missing one is usually the doc.`,
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
    body: `The change-lifecycle figure's knowledge-management entry: the agent querying team knowledge at generation time through a protocol instead of relying on what is in context.

Decision rule: in-repo knowledge goes in files — indexed docs, decision journal, catalog, snapshots — because files plus search plus progressive disclosure cost zero tokens until needed, while protocol servers tax every turn with context. A remote knowledge server earns its place only for off-repo knowledge (library API docs) looked up often enough that CLI scraping turns clumsy. Trigger for revisiting: repeated multi-repo or off-repo lookups.

Consumption discipline (Day-2 paper), for when a server is warranted: consume, don't build — search registries (public for prototyping, vetted official, internal first) before writing any wrapper, collapsing N×M bespoke integrations to N+M. Discover, configure (scoped permissions, env-file credentials, read/write boundaries), connect (handshake listing tools, schema validated before real use). Checklist: audit public servers before attaching anything with filesystem or credential access; load tools RAG-style (in-context only while needed); default read-only and non-prod data; scope one project, never broad. Debug transport before prompts — schemas and streams via inspector tooling, not system-prompt tweaks. Never hardcode credentials, never point at production.`,
    considered: true,
    implemented: false,
    wanted: false,
    tags: ['mcp', 'knowledge', 'feedforward', 'deferred'],
    links: [
      { label: 'article — change lifecycle', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'opencode MCP servers', url: 'https://opencode.ai/docs/mcp-servers' },
      { label: 'Day-2 paper — consumption', url: 'https://www.kaggle.com/whitepaper-agent-tools-and-interoperability-with-mcp' },
    ],
  },
  {
    title: 'Self-correction loop',
    category: 'Workflow',
    summary: 'The first feedback ring, run pre-handoff: self-review checklist + lint + domain rules + coverage core — fast controls, every change.',
    body: `The change-lifecycle figure's self-correction loop: the agent's first feedback pass before human eyes — fast controls, every change, fix before handoff:

1. **Self-review checklist** — minimalism · scope · quality bars · receipts. Same model, ritualized; second-model review waits on a semantic slip.
2. **Lint** — flat config, recommended set minus typechecker-covered noise.
3. **Domain rules** — a couple of earned static rules for the project's failure classes (e.g. no raw eval, no absolute-local fetch in browser code).
4. **Coverage core** — unit-tested pure logic with real per-file lines, thresholds off until earned; a thin HTTP suite proves the seams instead of chasing unmeasurable black-box coverage.
5. **Dependency rules** — layer boundaries at error severity once the tree earns them.

The pipeline re-run half (CI) is optional at small scale — one command can serve both halves until it can't.`,
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
    summary: 'Continuous drift sensor for dead code: a real watcher past a size trigger — below it, a one-shot pass plus the Minimalism norm.',
    body: `A continuous sensor watching for code nobody calls, so rot accumulates visibly instead of silently.

Below the size where a watcher earns its keep, substitute: one manual references pass (delete corpses on the spot), plus the standing norm — Minimalism plus review read-backs keep new dead code out. Revisit trigger: source tree past ~100 files, or a second corpse found by hand — whichever first earns a real watcher.`,
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
    summary: 'Continuous drift sensor for the dependency tree: scheduled vulnerability PRs, capped open — each one just another change in the pipeline.',
    body: `Someone else's vulnerabilities arrive on their schedule, not yours — a scheduled dependency service (weekly, max a few open PRs) turns them into routine changes: the check suite runs on each, review reads it, a human merges.

Scope deliberately: cap open PRs below review bandwidth, or they just stack. Pin only what matters (a version that actually affects behavior); leave the rest floating until it does.`,
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

Manual probe pattern first: plant a handful of deliberate bugs (dropped normalization, flag flips, reverted regression fixes), confirm the suite kills each, revert immediately. A surviving mutant is a validation gap, not a coverage gap. Full mutation tooling earns its place past a size trigger or after the first slipped seam — command-runner based tools drive any test command by exit code, and reports stay untracked residue.`,
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
    summary: 'Cross-file sensor: layer rules (routes→logic→persistence, ops aside, extensions isolated) green in check, plus a generated import graph.',
    body: `Basic linting sees files; dependency rules see across them — which layers may import which, enforced at error severity inside the check command. Co-write the config with the agent (it absorbs the syntax cost), and word violations as layering recaps so they self-correct.

Typical rules: logic stays UI-free (unit-testable, portable); persistence takes no app dependencies; ops scripts drive libraries or HTTP, never pages; extensions import only the runtime API (portability). State blind spots outright (template frontmatter, dynamic imports); a generated import graph makes drift visible on demand.

Adoption note: this replaces structure-description prose with an enforced boundary — and it can graduate early on explicit call, no second violation needed.

Taste invariants (OpenAI): beyond layer direction, encode mechanical taste — structured logging, naming conventions for schemas and types, file-size limits — as custom lints with remediation messages. Boundaries centrally, autonomy locally: care deeply about edges, correctness, and reproducibility, and leave everything inside them free. Once encoded, a taste rule applies everywhere at once — multipliers, not pedantry.

Boundaries before tests (Lecture 10): e2e on a tangled architecture only proves the whole mess runs. Establish architectural constraints on day one — agents copy existing patterns, inconsistencies included, so every session without constraints adds drift. The reference shape is a layered domain: fixed layers per domain (Types → Config → Repo → Service → Runtime → UI), dependencies strictly forward, cross-domain concerns through explicit provider interfaces, everything else forbidden and mechanically enforced. Key principle: enforce invariants, don't micromanage implementation — require "data is parsed at the boundary" without prescribing the library.

Every constraint gets its executable check, down to one-liners:

\`\`\`bash
# Check whether the renderer process directly calls Node.js APIs
grep -r "require('fs')" src/renderer/ && exit 1 || echo "OK: no direct fs access in renderer"
\`\`\`

## Layered domain, explained

The reference shape for what those boundaries look like — fixed layers per domain, strictly forward dependencies, one explicit door for cross-cutting concerns:

![Layered domain architecture: forward-only layers with Providers as the single cross-cutting door](/uploads/5ee4aa23-9972-4c7c-97b7-f60170caf2c7.png)

Three ideas make it work. **Parse at the boundary:** incoming data arrives untyped — convert it once into typed domain objects at the edge or reject it there. Past that point nothing re-checks; the type system carries the proof inward. Agents guess shapes, and a guess caught at the door fails loudly with the payload in hand instead of mysteriously three layers deep. **Rigid structure:** agents copy surrounding patterns, inconsistencies included — one layer, one job, everywhere, so the pattern is always the same. Global reasoning collapses into local reasoning: a layer needs only its contracts with the neighbors above and below. **Forward-only flow with Providers:** Types → Config → Repo → Service → Runtime → UI, never backward; auth, telemetry, flags, and connectors enter through exactly one interface, with shared utils outside the domain feeding it. Direction controls blast radius (UI can never break Types; Types may affect everything above), cycles are structurally impossible, and every box shows what it may touch and what it can't. Day-one prerequisite, not big-team luxury — without it every session adds drift; with it drift has nowhere to enter.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['dep-cruiser', 'dependencies', 'layers', 'sensor', 'computational'],
    links: [
      { label: 'sensors article — dependency rules', url: 'https://martinfowler.com/articles/sensors-for-coding-agents.html' },
      { label: 'dependency-cruiser', url: 'https://github.com/sverweij/dependency-cruiser' },
      { label: 'generated graph', url: 'docs/dependency-graph.mmd' },
      { label: 'lecture 10 — arch rules executable', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-10-why-end-to-end-testing-changes-results/' },
      { label: 'OpenAI — taste + layers', url: 'https://openai.com/index/harness-engineering/' },
    ],
  },
  {
    title: 'Safeguards against AI missteps',
    category: 'Knowledge',
    summary: 'The safeguard list against LLM caprice (individual + team), quoted whole, each item mapped to a control class.',
    body: `From "The role of developer skills in agentic coding" (the failure-modes catalog the harness article maps its sensors against) — quoted whole, then mapped to control classes:

## Individual coder

- **Always carefully review AI-generated code.** It is very rare that I do NOT find something to fix or improve. → *read-back checklist before handoff; human-review ring stays, no autonomous merging.*
- **Stop AI coding sessions when you feel overwhelmed.** Revise the prompt and start fresh, or fall back to manual implementation. → *clarify-don't-guess; short sessions, fresh branches when context degrades.*
- **Stay cautious of "good enough" solutions** created miraculously fast but carrying maintenance cost. → *minimalism plus an over-engineering read in review.*
- **Practice pair programming.** Four eyes catch more than two. → *the agent loop under human eyes is the pair; second-model review waits on a trigger.*

## Team and organization

- **Good ol' code quality monitoring** (watch duplication harder now). → *the computational ring (typecheck, lint, domain rules, tests).*
- **Pre-commit hooks and IDE-integrated review — shift left.** → *a pre-handoff gate plus CI on push.*
- **Revisit practices; keep a "Go-wrong" log**, reflected on weekly. → *a decisions journal as the log; a repetition tripwire as the wanted automation.*
- **Make use of custom rules** (sent with every prompt — obeyed only probabilistically, worse in long sessions). → *entry-file plus skill rules, with the caveat recorded; rules that can graduate become sensors.*
- **Culture of trust and open communication** — pressure to deliver "because AI" is itself a quality risk. → *stands even at single-human scale, against merging green-but-unread diffs.*

New safeguards should arrive the same way these did — quoted, then mapped, then built.`,
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
    summary: 'Compiler-extracted coupling data, built thin: fan-in/fan-out + cycles + blast radius via CLI, static dashboard as app tab — triage use, not judgment.',
    body: `Custom compiler tooling extracting per-file import plus call edges, in two faces:

1. **CLI for the agent** — hotspots (fan-in/fan-out), transitive blast radius for review triage, cycle detection, full JSON output.
2. **Dashboard for the human** — static tabs (structure, coupling, cohesion, risk, functions, layers) served as an app page. Deliberately tables and bars — fancy visualizations don't reduce review load.

Verify against the dependency-rule engine (same edge set, two readers). State limits outright (template files invisible, call-edge resolution thin — the import graph carries the triage use). On demand during review, not a check gate. Load-bearing rule: data in service of attention (where to look hard), not judgment — good/bad needs appropriateness context that lives outside the graph.`,
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
    summary: 'Balanced-Coupling review/design skills: evidence-first (numbers quoted before judgment), interview-style scoping, reports to docs.',
    body: `AI modularity review with strong prompts (Balanced Coupling model — integration strength, distance, volatility plus the balance rule) finds what coupling data alone cannot, and running twice surfaces different issues.

Adoption shape: upstream skill bodies kept verbatim with license, plus a project adapter (vendor interview protocol → local questioning rounds, vendor task tracking → local todos, evidence → the coupling CLI, reports → docs). Load-bearing rule from the model's lessons: numbers quoted before judgment, legitimate hubs acquitted in writing. New capability stays on probation until the first structural change (or a snapshot ritual) triggers a real run.`,
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

Each line names something a command can confirm. Translate the runners to your stack — whatever test runner, typechecker, and contract assertions you use. The form is the point, not the tools. Done is behavior verified, never code that looks fine.

Hardened form — leveled termination, no skipping (Lecture 09). The agent's confidence is systematically miscalibrated, so completion judgment belongs to the harness, executed layer by layer on runtime signals, not feelings:

\`\`\`markdown
## Definition of Done
- Feature complete = end-to-end verification passed, not "code is written"
- Required verification levels:
  1. Unit tests pass
  2. Integration tests pass
  3. End-to-end flow verification passes
- Do not proceed to level 2 if level 1 fails
- Do not proceed to level 3 if level 2 fails
\`\`\`

Layer 1 (syntax/static) is the bare minimum — spell correctly before reading further. Layer 2 (runtime behavior: tests, startup, critical paths) is the core evidence — not just written, but runnable. Layer 3 (system: e2e, integration, user scenarios) is the last line — not just runnable, but correct.

Evals first (SDLC paper): write the eval suite before generating the code. Tests plus evals are the primary mechanism for communicating intent — a well-written eval suite tells the agent what "correct" means more precisely than any prompt, and hands it automated verification in the same motion. Acceptance criteria aren't checked after the fact; they precede the work.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['definition-of-done', 'completion', 'verification', 'workflow'],
    links: [
      { label: 'lecture 01', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-01-why-capable-agents-still-fail/' },
      { label: 'lecture 07 — completion evidence', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-07-why-agents-overreach-and-under-finish/' },
      { label: 'lecture 08 — primitives', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-08-why-feature-lists-are-harness-primitives/' },
      { label: 'lecture 09 — leveled termination', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-09-why-agents-declare-victory-too-early/' },
      { label: 'lecture 10 — e2e layer', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-10-why-end-to-end-testing-changes-results/' },
      { label: 'lecture 13 — goal triple', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-13-loop-engineering/' },
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
      { label: 'lecture 09 — calibration bias', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-09-why-agents-declare-victory-too-early/' },
    ],
  },
  {
    title: 'Context-anxiety discipline',
    category: 'Knowledge',
    summary: 'Lecture-01 failure mode: agents rush and skip verification when context runs low — watch the tokens, restart fresh, never economize on checks.',
    body: `When agents sense context running low, they rush to finish — skipping verification, choosing simple over optimal. Name context anxiety as a failure mode rather than suffering it as bad luck.

Discipline: track context usage per turn so the pressure is visible; prefer a fresh session over pushing a long one; treat compaction summaries as lossy by design — re-verify, don't trust; verification steps are never the thing to cut to "save" context. Optionally automate the nudge: warn when a session's context passes a threshold and suggest a restart.

On /compact: built-in compaction is the within-session half, and it keeps the what while dropping the why — the reasons behind decisions, skipped alternatives, verification state. A clean reset from complete artifacts beats a compacted session carrying invisible anxiety. Know your model, too: sensitivity to context pressure differs across models, so the compact-vs-reset balance is tuned per target, not templated once. Files are compaction's complement, not its rival.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['context', 'sessions', 'verification', 'discipline'],
    links: [
      { label: 'lecture 01', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-01-why-capable-agents-still-fail/' },
      { label: 'lecture 05 — compact vs reset', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-05-why-long-running-tasks-lose-continuity/' },
    ],
  },
  {
    title: 'Sensors sidecar',
    category: 'Tooling',
    summary: 'The continuous daemon complement to the gate: fast sensors on intervals with an agent summary face; heavies stay in check/CI.',
    body: `A sensor daemon running fast checks on 60–120s intervals, with two faces: a human HUD and a token-efficient agent summary. The check command remains the gate (one-shot, authoritative); the sidecar is situational awareness between gates — and the history it accumulates becomes the failure ledger a repetition tripwire stands on.

Shape of the adoption:

- **Native parsers where they exist** — stock machine-readable commands for lint and domain rules; everything else through one generic wrapper where the exit code is the verdict. No per-sensor parser code.
- **Fast slices only** — browser flows, HTTP suite, and mutation runs stay out (server plus minutes is check/CI territory); expensive tools are read from their last report on interval, run manually.
- **Config tracked, runtime ignored** — sensor config versioned; runtime state excluded by the tool's own ignore rules.

Resolve frictions in favor of truthful errors: silent modes and swallowed failures are sensor bugs, not features.`,
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
    summary: 'Single-process analogue of the per-worktree stack: access log + metrics endpoint + trace ring with request IDs — no daemons, queryable today.',
    body: `Logs/metrics/traces rebuilt at local scale with zero dependencies:

- **LOGS:** a JSONL access log — every request with trace id, timing, checkpoints. Grep-able; a log shipper can tail it later.
- **METRICS:** Prometheus text at a metrics endpoint — request counts, average/p50 durations, by-status and top-path families. Scrapeable if a TSDB ever arrives.
- **TRACES:** a request id on every response, checkpoints in list handlers, a last-N ring endpoint. Middleware starts and finishes all traces; observability never fails requests.

Expect the log to earn its keep first (what errored, what the session hit); metrics and traces are cheap ballast until a latency question or a second process arrives. Process-lifetime memories reset on reload — state that. Thin tests pin all three seams.

Collect signals in the harness, not from the agent (Lecture 11): agents don't log what they don't know they need, formats drift across sessions, and contracts/rubrics aren't loggable at all. The checklist — application lifecycle phases (startup, ready, running, shutdown); feature-path execution with entry points, checkpoints, and exits; data flow between components; resource utilization anomalies; full error context, never just the message.

Standardize toward OpenTelemetry shape: one trace per session, one span per task, sub-spans per verification step, standard attributes on each — so the data can integrate with standard toolchains later. Wanted horizon at single-user scale: the hierarchy first (session → task → verification), the collector second, Jaeger last if ever.`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['observability', 'logs', 'metrics', 'traces'],
    links: [
      { label: 'OpenAI harness engineering', url: 'https://openai.com/index/harness-engineering/' },
      { label: 'live metrics', url: '/api/metrics' },
      { label: 'live traces', url: '/api/traces' },
      { label: 'lecture 11 — runtime layer', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-11-why-observability-belongs-inside-the-harness/' },
    ],
  },
  {
    title: 'AI-aware deployment (out of scope)',
    category: 'Tooling',
    summary: 'SDLC-paper practice parked: health monitoring, auto-rollback, risk prediction — activates on the first prod target.',
    body: `Deployment pipelines that watch themselves: agents monitoring deploy health, automatically rolling back bad releases, predicting risk from change scope — with production behaviour feeding back into development decisions.

Out of scope until the first production target exists: no prod, no deploys, no rollback to automate. Until then the check command plus the preview server is the whole pipeline. Trigger: the day something ships beyond local — health checks first, rollback second, prediction last.`,
    considered: true,
    implemented: false,
    wanted: false,
    tags: ['deployment', 'rollback', 'out-of-scope'],
    links: [
      { label: 'SDLC paper', url: 'https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding' },
    ],
  },
  {
    title: 'Static/dynamic context boundary',    category: 'Knowledge',
    summary: 'SDLC-paper discipline: six context types split into always-loaded static and on-demand dynamic — the boundary a versioned decision.',
    body: `Code quality depends less on prompt cleverness than on context quality. An agent needs six types of context: instructions (role, goals, boundaries), knowledge (documents, diagrams, domain data), memory (session logs plus persistent state), examples (few-shot demos, reference patterns), tools (API/script/service definitions), and guardrails (hard constraints, safety rules).

![Six types of agent context](/uploads/1a935a3d-90e6-4132-a605-4958de3a9f61.png)

Split them by cost. Static context loads every interaction — system instructions, rule files, global memory, core guardrails: expensive but reliable, the agent never forgets. Dynamic context loads per task — skills by task match, tool results during execution, retrieved documents: pay only for what gets used. Too much static wastes tokens and dilutes signal; too little and the agent forgets critical rules.

![Static vs dynamic context and the boundary decision](/uploads/22456659-4abb-4a5c-a0f9-51c0fffdbc13.png)

The boundary itself is a first-class architectural decision, reviewed and versioned like code. The strongest dynamic pattern is skills: the agent sees lightweight metadata at startup, loads full instructions on task match, pulls deep reference only when explicitly needed — dozens of capabilities carried for the price of one. Guiding question throughout: what would a new team member need to contribute effectively, and how is that knowledge encoded for AI use?

Token economics (Day-3 paper): production's top failure mode isn't hallucination — it's context overflow, the model silently degrading past usable context long before the window fills. Relevance position matters (best at start/end, worst in the middle) and every model degrades as input grows, faster when noise drowns signal. Progressive disclosure is the architectural answer, and the math compounds: fifty workflows as one prompt loads ~15,000 tokens every turn; as a skills library, ~4,000 of metadata plus the ~2,000-token active body — same capability near a tenth of the cost, with published cases near 98% reductions.

![Token economics: one big prompt versus a skills library](/uploads/7c8fc750-d367-4a27-b42d-7c11cb4ab9f0.png)

Three implications: capacity is the wrong metric (degradation starts far below window size); active context is a budget, not a vessel — every token taxes attention from every other, allocate like infrastructure memory; skills resolve the constraint, holding active context small while available capability stays effectively unbounded.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['context', 'static-dynamic', 'skills', 'tokens'],
    links: [
      { label: 'SDLC paper', url: 'https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding' },
    ],
  },
  {
    title: 'How to Build Observability',
    category: 'Tooling',
    summary: 'Lecture-11 method, whole: harness-collected signals, sprint contracts, evaluator rubric, OpenTelemetry shape.',
    body: `## How to Build Observability

### 1. Build Runtime Signal Collection into the Harness

Don't rely on the agent to print its own logs. The harness should automatically collect the following signals:

- **Application lifecycle:** Startup, ready, running, shutdown phase states
- **Feature path execution:** Execution records for critical paths, including entry points, checkpoints, and exits
- **Data flow:** Records of data flowing between components
- **Resource utilization:** Abnormal resource usage patterns (e.g., continuously growing memory)
- **Errors and exceptions:** Full error context, not just error messages

### 2. Implement Sprint Contracts

Before each task begins, the generator and evaluator (which may be different invocations of the same agent) negotiate a contract that defines what to build and what "done" looks like:

\`\`\`markdown
# Sprint Contract: Dark Mode Support

## Scope
- Modify the theme toggle component
- Update global CSS variables
- Add dark mode tests

## Verification Standards
- Visual regression tests pass for each component
- Main flow end-to-end tests pass
- No flash of unstyled content (FOUC)

## Exclusions
- Not handling print styles
- Not handling third-party component dark mode
\`\`\`

### 3. Establish an Evaluator Rubric

Turn "is it good or not" into quantifiable scoring:

# Scoring Rubric

| Dimension | A | B | C | D |
|-----------|---|---|---|---|
| Code correctness | All tests pass | Main flow passes | Partial pass | Build fails |
| Architecture compliance | Fully compliant | Minor deviations | Obvious deviations | Serious violations |
| Test coverage | Main + edge cases | Main flow only | Only skeleton | No tests |

### 4. Standardize with OpenTelemetry

Create a trace for each harness session, a span for each task, and sub-spans for each verification step. Use standard attributes to annotate key information. This way observability data integrates with standard toolchains (Jaeger, Zipkin).`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['observability', 'how-to', 'signals', 'contract', 'rubric', 'opentelemetry'],
    links: [
      { label: 'lecture 11', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-11-why-observability-belongs-inside-the-harness/' },
    ],
  },
  {
    title: 'Observability Stack',
    category: 'Tooling',
    summary: 'OpenAI shape: app telemetry fanned out to queryable stores per task, agent querying and reasoning in a feedback loop to green.',
    body: `Give the agent a full observability stack, not just logs on disk: the app emits logs, metrics, and traces; a collector fans them out to queryable stores (a query language per signal); the agent queries, correlates, and reasons over real runtime data — then implements the change, restarts, re-runs the workload and the UI journey, and repeats the feedback loop until clean.

Two properties make it a stack rather than a pile: it is **queryable** (the agent asks questions of runtime behavior instead of reading dumps) and **ephemeral per task** (each unit of work gets an isolated app plus its signals, torn down when done — no cross-task contamination). Prompts like "no span in these critical journeys exceeds two seconds" become tractable only when the agent can interrogate the signals itself.

![Full observability stack: app telemetry fanned out to queryable stores, agent reasoning in a feedback loop with UI journeys](/uploads/16f7c175-db51-4067-867c-0520aeeb6d09.png)`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['observability', 'stack', 'telemetry', 'feedback-loop'],
    links: [
      { label: 'OpenAI harness engineering', url: 'https://openai.com/index/harness-engineering/' },
    ],
  },
  {
    title: 'Browser QA',
    category: 'Tooling',
    summary: 'Headless-browser behaviour sensor: console/DOM/error capture, full DOM eval, login flow, screenshots — catches what build cannot.',
    body: `A scriptable headless-browser sensor — the behaviour side of the regulation model. It catches what typecheck and build cannot: the page actually rendering, the auth flow actually working, the browser actually accepting responses (content negotiation, cookies — the whole class of things scripted HTTP clients lie about).

Capabilities: per-run capture of console errors/warnings, uncaught page errors, and failed requests; DOM assertions (selector present/absent, text presence, waits); full DOM API evaluation for structural checks (does the diagram render, how many version pills); scripted sign-in flow with env-supplied credentials, never hardcoded; full-page screenshots, with per-run noise untracked and curated evidence committed.

Wired into the suite as behaviour flows gated after the build — green means zero console errors, zero page errors, zero failed requests on the production build. Expect-error-free is meaningful against prod, not dev (dev toolbars and optimizer noise pollute headless runs).

With a vision-capable model the agent can look at the screenshots itself — same sensor, strictly stronger reader.

Cost shape (Lecture 11): QA rounds run single-digit percent of build cost while deciding pass/fail — verification is cheap, generation is expensive. The behaviour layer is never where to economize.

Drive, don't just observe (OpenAI): wire the browser DevTools protocol into the agent runtime with skills for DOM snapshots, screenshots, and navigation, so the agent reproduces bugs, validates fixes, and reasons about UI behaviour directly. The loop: select target and clear console, snapshot BEFORE, trigger the UI path, capture runtime events during interaction, snapshot AFTER, apply fix and restart — then re-run validation until clean:

![Agent drives the app through browser DevTools: snapshot before, trigger path, snapshot after, fix, re-validate until clean](/uploads/5c264350-37db-492f-aa04-fcbfb72b0bc2.png)`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['browser', 'qa', 'sensor', 'playwright', 'behaviour'],
    links: [
      { label: 'playwright-core', url: 'https://playwright.dev' },
      { label: 'check flows (runner)', url: 'scripts/qa-flows.mjs' },
      { label: 'screenshots', url: '/screenshots/qa-harness-map.png' },
      { label: 'lecture 10 — e2e layer', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-10-why-end-to-end-testing-changes-results/' },
      { label: 'OpenAI — DevTools driving', url: 'https://openai.com/index/harness-engineering/' },
    ],
  },
  {
    title: 'Language servers (batch typecheck)',
    category: 'Tooling',
    summary: 'Deterministic code intelligence as a batch sensor: full-repo typecheck in the check command — the control the build pretends to be.',
    body: `Ground-truth code intelligence — types, signatures, definitions, references, diagnostics — steering the agent before it writes. The same engine run after a change is a sensor; placement decides the role.

The audit finding that earns this mod: bundler builds strip types without checking them, so a "check" that runs build-only has no typecheck sensor at all — a type error sails through green. Chain the language engine in CLI mode into the check command (build → typecheck → secrets scan → behaviour flows). Interactive form (editor/extension diagnostics on edit, silent when clean) is the true guide placement; the batch sensor is its portable cover under runtimes without extension APIs. Watch the failure mode where a crashed probe is byte-identical to "clean" — failures need a distinct note.

Version gotchas are real: compilers change programmatic APIs across majors, so pin the toolchain the checker needs until support lands, and record the pin with its upstream reference.`,
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
    summary: 'Deliberate plan→build pipeline skills: interview, spec, tickets, implement — vertical slices, one at a time, never auto-invoked.',
    body: `A deliberate plan-to-build pipeline in four skills:

1. **Interview** (trigger-invokable) — the design interview: map the topic into a design tree, ask it in rounds (whole frontier at once, numbered questions each with a recommended answer), find all facts via web search plus repo reads. Greenfield seeds from a coverage list (requirements → architecture → risks → integrations → data → environments → backend → frontend → testing → infra → deployment → monitoring → release); new features take only the applicable subset. Ends when the frontier is empty and shared understanding is confirmed.
2. **Spec synthesis** — no-interview write-up of the settled tree (problem / solution / user stories / implementation decisions / highest test seam / open questions).
3. **Tickets** — tracer-bullet vertical-slice tickets with dependency edges (full path schema→API→UI→tests, demoable alone, one fresh context window; wide refactors via expand–contract). Quiz the breakdown.
4. **Implement** — one unblocked ticket at a time, TDD at the spec's seam, typecheck plus targeted tests regularly, full suite at the end, self-review, commit per ticket.

Adaptations that matter: facts through search skills instead of sub-agents; the tracker is local markdown instead of an issue tracker; deliberate steps never model-invoked, so the pipeline never runs accidentally. A spec is only as honest as its open questions.

Planner restraint (Lecture 11): the planning stage stays bold on scope and high on product context, and stops short of granular technical implementation. Premature specifics that turn out wrong cascade into every downstream step; constrain deliverables and let execution find its own path. Interview the what and the why exhaustively — leave the how sketchy on purpose.`,
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
    summary: 'Deterministic commands behind skill wrappers — the portable computational guides: same shell in any harness.',
    body: `Deterministic tooling the agent invokes before and during generation instead of guessing. The endorsed shape is the hybrid — a skill with instructions plus a bootstrap script — rated both computational and inferential. Typical inventory: web research CLI (search/scrape behind skills, with cost guards and outputs kept out of the context window), diagram CLI (typed input in, validated artifact out, repair receipt back), browser-evidence CLI (assert/eval/login/shot flags), plus project scripts for the pre-handoff gate and one-shot ops with exact commands and expected receipts.

Three placements: mid-loop via shell (facts, diagrams, browser evidence), the gate left-shifted into check, one-shot ops documented with commands and receipts. Portability rule: CLIs run through the shell every harness has — they are the one guide category that survives a harness switch unchanged, unlike runtime-specific extensions. New controls ship as skill plus script first.`,
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
    summary: 'Deterministic checks on every change: build + strict typecheck + secrets scan + lint/domain rules, with a thin HTTP suite and unit-covered core as backstop.',
    body: `Deterministic, seconds-fast checks on every change so the agent self-corrects before human eyes — with signals optimised for LLM consumption.

Layers, all in one check command:

1. **Build** — compile gate (bundlers strip types; a build checks nothing semantic — know this).
2. **Strict typecheck** — the language engine in CLI mode; zero errors, zero warnings.
3. **Secrets scan** — credential patterns over tracked files, file:line plus fix, values never printed. Must catch a live secret push on its first run to earn the name.
4. **Lint plus domain rules** — general lint config minus typechecker-covered noise, plus a couple of earned static rules for the project's failure classes.

Behavioural backstop (honestly scoped): a thin suite (zero-dep HTTP tests mirroring the browser flows, including content-negotiation and origin lessons, plus fuzz probes where hostile input never 500s; env-gated login paths sign out after) and unit coverage of the pure core with real per-file lines (regression and property cases included; black-box HTTP coverage stays unmeasurable on most servers — thresholds off until earned).

Explicitly parked: mutation testing (trigger: suite size where rot outruns eyeballs, or a slipped seam). Dependency rules graduate on explicit call.`,
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
    summary: 'Semantic judgment after the act: the implement self-review formalized into a read-back checklist; second-model and janitor review deferred with triggers.',
    body: `Inferential (semantic) feedback: a model re-reading code for what deterministic checks cannot see — misdiagnosis, over-engineering, wrong slice, spec mismatch. Ration by cost (review every change, architecture rarely) and give contradictory signals a tiebreaker (the Principles).

Unritualized self-review ("read it as a reviewer would") is insufficient — same model, same window, no checklist; the evidence is semantic slips sailing through to be caught by computational sensors instead. Formalize, don't expand: the implement step becomes a short read-back — minimalism · scope · quality bars · receipts — same cost, actual teeth.

Deferred with triggers: second-model spot review on risky diffs (auth, migrations, maps) after the next semantic slip past the checklist; janitor/GC agents only where something drifts at scale. Worker/checker separation (an independent nitpicky evaluator) is the autonomous end-state.

Generator/evaluator separation (Lecture 13): the agent that writes the code and the agent that checks it must be separated. A model grading its own work is untrustworthy; an independent verifier — sometimes using a different model entirely — is the baseline reliability guarantee of any loop. A model is its own output's best defense attorney: it sees its reasoning, not its mistakes. Someone in the crew must not believe you — and the skeptic needs fresh context (Lecture 14): never the implementer's memory, only the shared-state outputs. Reviewing your own reasoning is self-defense; reviewing bare outputs is review.

Output bar (OpenAI): the result needn't match human stylistic preferences — correct, maintainable, and legible to future agent runs meets the bar.

Judge against a rubric, not vibes (Lecture 11): quality dimensions with graded evidence levels turn evaluation from subjective judgment into reproducible scoring, so different reviewers reach similar verdicts on the same output:

# Scoring Rubric

| Dimension | A | B | C | D |
|-----------|---|---|---|---|
| Code correctness | All tests pass | Main flow passes | Partial pass | Build fails |
| Architecture compliance | Fully compliant | Minor deviations | Obvious deviations | Serious violations |
| Test coverage | Main + edge cases | Main flow only | Only skeleton | No tests |

Calibrate the reviewer itself (Lecture 11): early evaluators spot real issues, then talk themselves into dismissing them as not severe. Read the review logs, find where machine judgment diverged from human judgment, and patch the review prompt at exactly those points — several rounds of this loop is what makes scoring reliable.

Evaluate the path, not just the artifact (SDLC paper): output evaluation checks what was built (compiles, tests pass); trajectory evaluation checks how it got there (right steps, right tools, sound intermediate reasoning). A fluent output that skipped verification is more dangerous than a visible error. Tests are checked by code; evals by labelled datasets, rubrics, and judges — without both, the practice is vibe coding regardless of prompt sophistication.

Review-augmentation posture: the agent as first-pass reviewer (bugs, style, vulnerabilities, perf) before human eyes — never replacing human judgment on design, maintainability, and alignment, but cutting reviewer load. AI-aware deployment closes the loop: health monitoring, automatic rollback, risk prediction from change scope.

![Traditional vs AI-driven SDLC: compressed cycle with output and trajectory eval gates](/uploads/f8a22870-c9a9-4ae8-90a2-f783fbaf9360.png)`,
    considered: true,
    implemented: true,
    wanted: false,
    tags: ['review', 'sensor', 'inferential', 'self-review'],
    links: [
      { label: 'article — sensors', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'implement skill', url: '.pi/skills/implement/SKILL.md' },
      { label: 'lecture 09 — worker/checker split', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-09-why-agents-declare-victory-too-early/' },
      { label: 'lecture 11 — evaluator rubric', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-11-why-observability-belongs-inside-the-harness/' },
      { label: 'lecture 13 — maker/checker', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-13-loop-engineering/' },
      { label: 'lecture 14 — fresh context', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-14-graph-engineering/' },
      { label: 'OpenAI — output bar', url: 'https://openai.com/index/harness-engineering/' },
      { label: 'SDLC paper — trajectory + augmentation', url: 'https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding' },
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
    summary: 'The human iterates the harness on recurrence; the loop is human-triggered today — an automatic repetition tripwire is the wanted upgrade.',
    body: `The article's steering loop: whenever an issue recurs, improve the controls so it gets less probable — and use AI to build those controls (draft rules, scaffold linters, how-tos from archaeology). When the agent flounders, the fix is likewise never "try harder" (OpenAI) — ask what capability is missing, make it legible and enforceable, and have the agent itself build the fix. A decisions journal is the loop's memory: secrets incident → secrets scanner, invisible rule → entry-file rule, bracket bug → regression test.

Gap the loop usually has: it is human-triggered — recurrence is noticed by a person, then encoded. Nothing counts repetitions, so the "second occurrence" (lint) and "third occurrence" (codemod) triggers assume someone is counting.

Proposed mechanism (wanted, ~1 hour, zero deps): a failure ledger — the check command appends each sensor failure as one JSONL line (date, step, class, file) — plus a warn-only review script that counts classes in a window and prints rule candidates ("login flow failed 3rd time in 14 days — encode the bar?"). Thresholds mirror the existing rules (2 for lint-class, 3 for mechanical edits). Warn-only until the signal proves itself; a tripwire that cries wolf trains disregard, same as a noisy sensor.

Quality flywheel (SDLC paper): evaluate against a benchmark suite, diagnose failures by clustering root causes, optimize the prompts or tools that caused them, verify fixes against a regression suite, monitor production traffic for new failure modes. Each cycle compounds — the ledger is the data it feeds on.

Diagnose by layer (Lecture 01): don't just say "the model isn't good enough." Work through the five layers systematically — task not clearly defined, insufficient context, misconfigured environment, missing verification, loss of state between sessions. Attribution first, fix second: each layer points at a different control (spec, context budget, env parity, check gates, session discipline), and guessing the layer is how fixes land in the wrong place.`,
    considered: true,
    implemented: true,
    wanted: true,
    tags: ['steering-loop', 'meta', 'repetition', 'tripwire'],
    links: [
      { label: 'article — steering loop', url: 'https://martinfowler.com/articles/harness-engineering.html' },
      { label: 'lecture 01 — five layers', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-01-why-capable-agents-still-fail/' },
      { label: 'lecture 10 — review promotion', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-10-why-end-to-end-testing-changes-results/' },
      { label: 'lecture 11 — evaluator calibration', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-11-why-observability-belongs-inside-the-harness/' },
      { label: 'OpenAI — struggle signals', url: 'https://openai.com/index/harness-engineering/' },
      { label: 'SDLC paper — flywheel', url: 'https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding' },
      { label: 'decisions journal', url: 'docs/Harness decisions.md' },
    ],
  },
  {
    title: 'Progress file',
    category: 'Workflow',
    summary: 'Lecture-02 state subsystem: done / in-progress / blocked in one small file — the handoff each session writes to the next.',
    body: `Long tasks die between sessions: the next session inherits files but not intent. Keep one small progress file at a fixed path: what is done, what is in progress, what is blocked. Update it before each session ends; read it when the next one starts.

Fixed shape, tiny, always current — the handoff the agent writes to itself. Complements session hygiene (fresh restarts, distrusted summaries): hygiene keeps sessions cheap, the progress file keeps the work continuous.

External state (Lecture 13): memory that lives outside a single conversation — markdown files, issue trackers, kanban boards. Models forget everything between runs; memory must live on disk. The progress file is the minimal form; loops graduate it to shared boards the scheduler reads. Canonical shape:

\`\`\`markdown
# Project Progress

## Current State
- Latest commit: abc1234 (feat: add user preferences endpoint)
- Test status: 42/43 passing (test_pagination_edge_case failing)
- Lint: passing

## Completed
- [x] User model and database migration
- [x] Basic CRUD endpoints

## In Progress
- [ ] Pagination feature (90% - edge case test failing)

## Known Issues
- test_pagination_edge_case returns 500 on empty result sets

## Next Steps
1. Fix pagination edge case bug
2. Update API documentation
\`\`\``,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['progress', 'state', 'sessions', 'continuity'],
    links: [
      { label: 'lecture 02', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-02-what-a-harness-actually-is/' },
      { label: 'lecture 05 — template', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-05-why-long-running-tasks-lose-continuity/' },
      { label: 'lecture 13 — loop memory', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-13-loop-engineering/' },
    ],
  },
  {
    title: 'Five-subsystem audit',
    category: 'Workflow',
    summary: 'Lecture-02 ritual: score instructions/tools/environment/state/feedback 1–5, fix the lowest — harnesses rot like code.',
    body: `Score the five harness subsystems — instructions, tools, environment, state, feedback — 1 to 5. Fix the lowest first; thirty focused minutes beats another round of model-swapping.

Repeat on a cadence, because harnesses rot like code: instructions drift from reality, checks bit-rot, state files go stale. Treat the gap list as harness debt and pay it down like tech debt — the scheduled counterpart to fixing whatever just recurred.

Anatomy behind the five (SDLC paper): the model is roughly 10% of the system — the engine. The harness is the other 90%: framework layer shaping intelligence (instructions, tools, orchestration, guardrails), developer interface, deployment config, evals, memory store, observability, runtimes, scaling. The model is the engine; the harness is the car, the road, and the traffic laws.

![Harness anatomy: model at center, framework and operational layers around it](/uploads/81a6537c-ab57-4aba-83f9-6f539d9712b5.png)

The size of the harness effect is measurable, not rhetorical: one team moved an agent from outside the Top 30 to the Top 5 on a coding benchmark by changing only the harness, no model change; another gained 13.7 points tweaking only prompt, tools, and middleware around a fixed model. When an agent fails, blame the configuration first — missing tool, vague rule, absent guardrail, noisy context. Most failures, examined honestly, are harness failures.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['audit', 'harness-debt', 'review'],
    links: [
      { label: 'lecture 02', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-02-what-a-harness-actually-is/' },
      { label: 'SDLC paper — anatomy + evidence', url: 'https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding' },
      { label: 'Day-2 paper — config failures', url: 'https://www.kaggle.com/whitepaper-agent-tools-and-interoperability-with-mcp' },
    ],
  },
  {
    title: 'Harness ablation test',
    category: 'Tooling',
    summary: 'Lecture-02 experiment: remove one component at a time, measure the drop — ranks value, but only attribution finds bottlenecks.',
    body: `To rank what actually matters, remove one harness component at a time — instructions, feedback, state — and measure the performance drop on a fixed task with a fixed model. Biggest drop wins your attention next.

Caveat that makes it honest: ablation ranks marginal value, it does not locate bottlenecks. Pair every removal with failure attribution (unclear task? thin context? broken env? missing verification? lost state?) — only the attribution says where the bottleneck lives.

Turn it inward monthly (Lecture 12): every harness component exists because the model couldn't reliably do something alone — but capabilities move. Pick one component, disable it, run benchmark tasks; no degradation means permanent removal, degradation means restore or lighten. Problems absorbed by stronger models free attention for the next capability boundary — the harness doesn't shrink, it shifts.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['ablation', 'experiment', 'attribution', 'metrics'],
    links: [
      { label: 'lecture 02', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-02-what-a-harness-actually-is/' },
      { label: 'lecture 12 — simplify inward', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-12-why-every-session-must-leave-a-clean-state/' },
    ],
  },
  {
    title: 'Instruction SNR audit',
    category: 'Knowledge',
    summary: 'Lecture-04 method: matrix entries × task types, relocate noise to topic docs — "add a rule" is relief today, poison tomorrow.',
    body: `Every mistake tempts one more rule in the entry file, and each addition feels free — until 600 lines eat the context budget, bury hard constraints where models never look, and contradict each other. Audit instead: list every instruction entry, score its relevance across a few common task types, and move whatever is noise for most tasks into topic documents.

Every surviving rule documents its source (why added), applicability (when needed), and expiry (when removable) — audit on cadence and delete. Historical incident notes don't belong in instructions at all: convert them to test cases or delete them. Signal-to-noise is the metric; the entry file is a router, and routers stay thin.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['snr', 'audit', 'instructions', 'bloat'],
    links: [
      { label: 'lecture 04', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-04-why-one-giant-instruction-file-fails/' },
    ],
  },
  {
    title: 'Fresh session test',
    category: 'Workflow',
    summary: 'Lecture-03 ritual: new session, repo only, five questions — every blank is a missing piece of the map.',
    body: `Open a brand-new agent session with no verbal context — only the repository contents — and ask five questions: What is this system? How is it organized? How do I run it? How do I verify it? What is the current progress? How many it answers is how complete your map is.

Where the map is blank, the agent guesses; wrong guesses become bugs, and every new session guesses all over again. Count the blanks as your knowledge visibility gap (share of project decisions living outside the repo) and drive it down — the cost of guessing always exceeds the cost of drawing the map.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['fresh-session', 'visibility-gap', 'onboarding', 'test'],
    links: [
      { label: 'lecture 03', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-03-why-the-repository-must-become-the-system-of-record/' },
      { label: 'lecture 06 — readiness', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-06-why-initialization-needs-its-own-phase/' },
    ],
  },
  {
    title: 'Knowledge next to code',
    category: 'Knowledge',
    summary: 'Lecture-03 placement rule: constraint docs live beside the code they govern — proximity beats length, and updates ride with code.',
    body: `A rule about API authentication belongs next to the API code, not in a giant global document. Each module directory carries a short doc of its responsibilities, interfaces, and hard constraints — the directory itself is the index, no searching required. A 50-line file beside the code beats a 500-page wiki nobody maintains.

Two riders: minimal-but-complete (every entry earns its place by changing a decision; every fresh-session question still has an answer) and update-with-code (docs beside the code get noticed when the code changes; stale docs are worse than none — they send the agent the wrong way while it feels right).`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['knowledge', 'proximity', 'decay', 'docs'],
    links: [
      { label: 'lecture 03', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-03-why-the-repository-must-become-the-system-of-record/' },
      { label: 'lecture 04 — topic docs', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-04-why-one-giant-instruction-file-fails/' },
    ],
  },
  {
    title: 'ACID agent state',
    category: 'Workflow',
    summary: 'Lecture-03 frame: atomic ops, consistency predicates, isolation between agents, durable git-tracked knowledge.',
    body: `Run agent state like database transactions. Atomicity: a logical operation ships whole once verified, or is discarded — never half-merged. Consistency: define verifiable predicates (tests pass, lint clean) and check them after each operation; inconsistent states don't get committed. Isolation: concurrent agents get their own progress files or branches — shared mutable state is where toes get stepped on. Durability: anything that must survive the session goes in git-tracked files; what lives only in session memory doesn't count.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['acid', 'state', 'consistency', 'isolation'],
    links: [
      { label: 'lecture 03', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-03-why-the-repository-must-become-the-system-of-record/' },
      { label: 'lecture 12 — session integrity', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-12-why-every-session-must-leave-a-clean-state/' },
    ],
  },
  {
    title: 'Decision log',
    category: 'Knowledge',
    summary: 'Lecture-05 why-preserver: what was decided, why, rejected alternative, when — the reasoning compaction destroys.',
    body: `Code records the what; nothing records the why — why option B beat option A, why a library was rejected, why an optimization was skipped. Compaction summaries drop exactly this, and the next session re-decides from incomplete information or "optimizes" away a deliberate choice. Keep a decision log alongside the code: one entry per significant decision with reason, rejected alternative, and date.

No design documents — a few lines each. Git commits checkpoint the what and when for free; the log exists for the reasoning commits can't carry. Canonical shape:

\`\`\`markdown
# Design Decisions

## 2024-01-15: Use Redis for user preferences caching
- Reason: High read frequency (every API call), small data size
- Rejected alternative: PostgreSQL materialized view (high change frequency makes maintenance cost not worthwhile)
- Constraint: Cache TTL of 5 minutes, active invalidation on write
\`\`\``,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['decisions', 'rationale', 'state', 'continuity'],
    links: [
      { label: 'lecture 05', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-05-why-long-running-tasks-lose-continuity/' },
    ],
  },
  {
    title: 'Session handoff routine',
    category: 'Workflow',
    summary: 'Lecture-05 ritual: clock-in / clock-out around /compact — rebuild cost is the metric, drift is the enemy.',
    body: `Treat the agent like an engineer whose short-term memory wipes every session. Clock in: read the progress file, read the decision log, run verification to confirm a consistent state, continue from next steps. Clock out: update the progress file, re-verify, commit completed work. The routine is what makes reset-from-artifacts work — and what /compact hands off to.

Rebuild cost is the metric: minutes for a fresh session to reach an executable state, target single digits. Mixed strategy: short tasks stay in-session; once a task needs most of the window, prepare the handoff instead of pushing through. Without the routine, each boundary adds drift — small misunderstandings compounding session after session until the work no longer resembles the intent.

Clean state is completion, not housekeeping (Lecture 12): session done means task verified AND all five exit conditions met — build passes, tests pass (including pre-existing ones, verified in CI not just locally), progress recorded in machine-readable artifacts, no stale artifacts, startup path functional:

\`\`\`markdown
## Session Exit Checklist
- [ ] Build passes (npm run build)
- [ ] All tests pass (npm test)
- [ ] Feature list updated
- [ ] No debug code remaining (console.log, debugger, TODO)
- [ ] Standard startup path available (npm run dev)
\`\`\`

Immediate cleanup every session (temp files, debug logs, commented code — "clean up later" means never, and the next session can't tell intentional from temporary), periodic cleanup weekly (structural scan, quality-doc refresh, drift benchmarks). Cleanup ops must be idempotent — safe to re-run, no side effects on repeat:

\`\`\`bash
# Idempotent cleanup operations
rm -f /tmp/debug-*.log  # -f ensures no error when files don't exist
git checkout -- .env.local  # Restore to known state
npm run test  # Verify cleanup didn't break anything
\`\`\`

Throughput caveat: fast-merge philosophy (minimize gates when agent output exceeds review capacity) applies to high-throughput regimes only. At supervised single-human scale the stance stays opposite — no autonomous merging, human eyes on every diff.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['handoff', 'sessions', 'rebuild-cost', 'drift'],
    links: [
      { label: 'lecture 05', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-05-why-long-running-tasks-lose-continuity/' },
      { label: 'lecture 06 — readiness', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-06-why-initialization-needs-its-own-phase/' },
      { label: 'lecture 12 — clean state', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-12-why-every-session-must-leave-a-clean-state/' },
    ],
  },
  {
    title: 'Task breakdown',
    category: 'Workflow',
    summary: 'Lecture-06 list: the whole job as ordered tasks, each with its acceptance command — what session 2 works down.',
    body: `A Definition of Done defines the format of done; the breakdown is the ordered list itself: every task in sequence, each carrying its acceptance criteria in command form. Session 2 doesn't decide what to do next — it reads the list. Canonical shape:

\`\`\`markdown
# Task Breakdown

## Task 1: User Authentication Basics
- Implement JWT auth middleware
- Add login/register endpoints
- Acceptance: pytest tests/test_auth.py all passing

## Task 2: User Profile Page
- Implement user profile CRUD
- Add profile edit form
- Acceptance: pytest tests/test_profile.py all passing
\`\`\`

Committed early, updated as understanding grows. On a persistent-local setup the environment half of initialization is already done — this list is the half that remains: always ready to hand off, no verbal explanation needed.

The hardening (Lecture 08): a breakdown the agent merely reads is a document; a breakdown the harness executes is a primitive — scheduler, verifier, handoff, and progress tracking all consuming the same file, unbypassable like a database constraint rather than an application check. The full method:

**1. Define a minimal feature list format.** No complex system needed — structured Markdown or JSON works. Every entry carries the triple (behavior, verification, state) plus an evidence pointer:

\`\`\`json
{
  "id": "F03",
  "behavior": "POST /cart/items with {product_id, quantity} returns 201",
  "verification": "curl -X POST http://localhost:3000/api/cart/items -H 'Content-Type: application/json' -d '{\"product_id\":1,\"quantity\":2}' | jq .status == 201",
  "state": "passing",
  "evidence": "commit abc123, test output log"
}
\`\`\`

**2. Let the harness control state transitions.** The agent never marks its own work passing — it submits a verification request, the harness runs the command and flips the state. Pass-state gating. (Autonomous end-state: in supervised use the human is the verifier, and a transition-owning script is machinery without a problem. Record the direction; build it when the loop runs unattended.)

**3. Write the rules in the entry file.**

\`\`\`markdown
## Feature List Rules
- Feature list file: /docs/features.md
- Only one feature active at a time
- Verification command must pass before marking as passing
- Don't modify feature list states yourself — the verification script updates them automatically
\`\`\`

**4. Calibrate granularity.** One item per session: "user can add items to cart" is right; "implement the shopping cart" won't finish; "create the name field on the Cart model" drowns in overhead.

## Feature State Machine

The triple and the lifecycle, as the lecture draws them — one feature row is behavior plus verification plus state, and every item flows pick → work → verify → pass (with evidence) / fail (stay active) / dependency issue (blocked):

![Feature row triple: behavior, verification command, state](/uploads/21e3cc6f-9684-4191-b001-52b2458e8994.png)

![Feature lifecycle: pick next not_started, work, verify, mark passing/active/blocked](/uploads/ee5e6db8-2198-4014-9265-02131abc0935.png)`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['breakdown', 'planning', 'acceptance', 'continuity'],
    links: [
      { label: 'lecture 06', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-06-why-initialization-needs-its-own-phase/' },
      { label: 'lecture 07 — scope surface', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-07-why-agents-overreach-and-under-finish/' },
      { label: 'lecture 08 — primitives', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-08-why-feature-lists-are-harness-primitives/' },
    ],
  },
  {
    title: 'Sprint contract',
    category: 'Workflow',
    summary: 'Lecture-11 before-work agreement: scope + verification standards + exclusions — what done looks like, negotiated up front.',
    body: `Before implementation starts, the builder and the checker agree in writing what will be built and what done looks like: task scope, verification standards per item, and exclusions — what is explicitly out. The contract front-loads alignment so the builder never finishes something the checker rejects for foreseeable reasons. Canonical shape:

\`\`\`markdown
# Sprint Contract: Dark Mode Support

## Scope
- Modify the theme toggle component
- Update global CSS variables
- Add dark mode tests

## Verification Standards
- Visual regression tests pass for each component
- Main flow end-to-end tests pass
- No flash of unstyled content (FOUC)

## Exclusions
- Not handling print styles
- Not handling third-party component dark mode
\`\`\`

Read at clock-in alongside the progress file; evaluated against at handoff. Exclusions are the load-bearing field — every out-of-scope item named up front is a misunderstanding that never happens.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['contract', 'scope', 'exclusions', 'alignment'],
    links: [
      { label: 'lecture 11', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-11-why-observability-belongs-inside-the-harness/' },
    ],
  },
  {
    title: 'Factory model',
    category: 'Workflow',
    summary: 'SDLC-paper operating model: the developer output is the factory — specs and guardrails above, planning/coding/verification agents below.',
    body: `The developer's primary output is not code — it's the system that produces code. Two zones: the Developer Zone (define specs, design guardrails, review and approve) and the Agent Factory Floor (planning agent → coding agent → tests-and-verification gate → verified output, with failure feedback looping back to planning and guardrails railing the whole floor).

![Factory model: developer zone above, agent factory floor below, guardrails as rails](/uploads/68cde336-7301-4b3d-a59d-815dd5041231.png)

Five parts make the factory: specifications and context, agents translating spec to implementation, tests and quality gates, feedback loops routing failures back, guardrails constraining behavior. Manage it like a factory manager: design the line, ensure quality control, give agents success criteria rather than step-by-step instructions — then let them iterate.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['factory', 'operating-model', 'zones', 'guardrails'],
    links: [
      { label: 'SDLC paper', url: 'https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding' },
    ],
  },
  {
    title: 'Quality document',
    category: 'Knowledge',
    summary: 'Lecture-12 health tracker: per-module grades showing whether the codebase strengthens or weakens — fix the lowest first.',
    body: `A living artifact that scores every module on verification, understandability, test stability, boundary compliance, and conventions — not a one-time assessment but a tracker of direction. New sessions read it and know where to prioritize; the weekly cleanup scan refreshes it. Canonical shape:

\`\`\`markdown
# Quality Document

## User Authentication Module (Quality: A)
- Verification passing: Yes
- Agent understandable: Yes
- Test stability: Stable
- Architecture boundaries: Compliant
- Code conventions: Followed

## Payment Module (Quality: C)
- Verification passing: Partial (payment callback untested)
- Agent understandable: Difficult (logic spread across 3 files)
- Test stability: Unstable (2 flaky tests)
- Architecture boundaries: Violations present
- Code conventions: Partially followed
\`\`\`

You can only proactively fix what you know is degrading — without the doc, entropy compounds silently (the observed 12-week drift: builds 100%→68%, session startup 5→60 minutes). With it, each session spends minutes on cleanup and saves hours of chaos.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['quality', 'health', 'entropy', 'cleanup'],
    links: [
      { label: 'lecture 12', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-12-why-every-session-must-leave-a-clean-state/' },
    ],
  },
  {
    title: 'Garbage collection',
    category: 'Workflow',
    summary: 'OpenAI practice: golden principles in the repo plus recurring scans that update grades and open refactor PRs — small continuous payments.',
    body: `Agents copy existing patterns — uneven and suboptimal ones included — so drift compounds by default and manual cleanup Fridays don't scale. Fight entropy like garbage collection: small continuous payments, not painful bursts.

Two halves. **Golden principles**, opinionated mechanical rules kept in the repo that hold the codebase legible for future runs: prefer shared utility packages over hand-rolled helpers (invariants stay centralized); never probe data YOLO-style (validate boundaries or rely on typed SDKs, so nothing builds on guessed shapes). **Recurring scans** on cadence that check for deviations, update quality grades, and open targeted refactoring PRs — each reviewable in about a minute.

Human taste is captured once, then enforced continuously on every line: bad patterns get caught daily instead of spreading for weeks. Technical debt is a high-interest loan — continuous small paydowns beat compounding every time.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['garbage-collection', 'entropy', 'principles', 'cleanup'],
    links: [
      { label: 'OpenAI harness engineering', url: 'https://openai.com/index/harness-engineering/' },
    ],
  },
  {
    title: 'Bounded vs unbounded',
    category: 'Workflow',
    summary: 'Day-2 design lens: fire-and-forget work becomes tools; pause-clarify-resume work needs agent handling — never GOTO a tool.',
    body: `Before making a capability "just another tool," ask whether its domain is bounded or unbounded. Bounded: one well-formed request, one response, fire-and-forget — make it a tool (or a deterministic template, when even the layout is fixed). Unbounded: ambiguity, pauses, clarifying questions, resumed state — it needs agent-level handling, not a wrapper.

Forcing unbounded work into a tool is the GOTO problem of agentic architecture: control flow leaves structured context and may never cleanly return, while the tool layer's contract (predictable, structured) rots. Keep the tool layer clean by isolating multi-turn mess at the agent layer. The test runs both directions: a tool that keeps needing follow-up questions wants promoting; an agent doing single-shot deterministic transforms wants demoting to a template.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['bounded', 'tools', 'agents', 'design'],
    links: [
      { label: 'Day-2 paper', url: 'https://www.kaggle.com/whitepaper-agent-tools-and-interoperability-with-mcp' },
    ],
  },
  {
    title: 'Boring dependencies',
    category: 'Knowledge',
    summary: 'OpenAI rule: favor dependencies the agent can fully model — boring and legible beats clever and opaque; reimplement the subset when cheaper.',
    body: `Judge dependencies by agent-legibility, not just features: composable, API-stable, well-represented-in-training "boring" technology the agent can internalize and reason about beats a clever library with opaque behavior. An agent can only work with what it can model.

When working around an opaque upstream costs more than reimplementing the subset, reimplement — tightly integrated with your instrumentation, fully tested, behaving exactly the runtime expects. A hand-rolled helper with complete tests beats a generic package fought at every call site. Legibility is leverage: pulled into inspectable form, the dependency serves every future agent run, not just this one.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['dependencies', 'legibility', 'simplicity'],
    links: [
      { label: 'OpenAI harness engineering', url: 'https://openai.com/index/harness-engineering/' },
    ],
  },
  {
    title: 'Loop silent costs',
    category: 'Workflow',
    summary: 'Lecture-13 audit lens: verification debt, comprehension rot, cognitive surrender, token blowout — loops accelerate risk, not just output.',
    body: `Loops accelerate output — and risk. Four costs accumulate silently while a repeated agent workflow runs, autonomous or supervised:

- **Verification debt:** "looks fine" accepted instead of machine-confirmed. Stopping conditions must be checkable, never felt.
- **Comprehension rot:** the faster the loop ships, the further your understanding of your own codebase drifts. Fast loops require fast reading — if you don't read and use what it produces, comprehension decays continuously.
- **Cognitive surrender:** the comfortable posture of taking whatever comes back without opinions. Two people can run the same loop and get opposite results: one goes faster on work they understand, the other avoids understanding the work. The loop can't tell the difference — you must.
- **Token blowout:** context grows roughly quadratically with turns unless managed from the first loop, not bolted on later.

Audit any repeated workflow against all four on a cadence. The time a loop saves isn't for resting — it's for making more judgments.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['loops', 'costs', 'audit', 'debt'],
    links: [
      { label: 'lecture 13', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-13-loop-engineering/' },
    ],
  },
  {
    title: 'Methodology file',
    category: 'Knowledge',
    summary: 'Lecture-13 horizon: give the agent a methodology, not tasks — human touches direction, agent touches code, ratchet only forward.',
    body: `The loop-engineering end-state: a methodology document the agent executes indefinitely, not a task list. The human edits direction (goal, constraints, exploration space, evaluation rules, the iron rule to never stop for help); the agent edits code. Fixed time budgets per iteration keep results comparable; only improvements stay on the main line, failures roll back — a ratchet that moves forward or not at all.

Horizon item while a human supervises every run: nothing to build yet, but the trajectory belongs in the catalog. First step when it earns building: one recurring task as goal-plus-stopping-condition, one markdown memory file, one timer — then stack upward.

Anchors (Lecture 14): no matter how elegant the topology, drifting loops in formation are still drifting. Pin every loop to reality — actual outcomes, ground-truth datasets, human spot-checks. Easiest part of the design to skip; least affordable to.

What a complete loop looks like assembled — automation fires, external state is read, triage prioritizes, each item forks an isolated worktree, implementer and verifier split the work, passes open PRs and update state, everything lands in a triage inbox for human review:

![Morning triage loop: automation, external state, triage, isolated worktrees, implementer/verifier split, PR connectors, inbox review](/uploads/9531379d-8037-47f2-b807-40a96ff4ea1c.png)`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['loops', 'methodology', 'autonomy', 'horizon'],
    links: [
      { label: 'lecture 13', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-13-loop-engineering/' },
      { label: 'lecture 14 — anchors', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-14-graph-engineering/' },
    ],
  },
  {
    title: 'Graph-worthiness test',
    category: 'Workflow',
    summary: 'Lecture-14 gate: five criteria, need three — branches and rollbacks decide, not scale; default answer is don’t draw.',
    body: `A loop becomes a graph when work needs specialization, parallelism, explicit rollback paths, and shared state — but most work doesn't qualify. Score the candidate against five criteria and require three: independently decomposable units, branch or rollback paths worth declaring, intermediate state worth checkpointing, explicitly verifiable nodes, coordination benefits outweighing coordination costs.

"Complex" doesn't mean many steps — a 20-step linear pipeline is a workflow, or a script. Five nodes with real rollback, parallelism, and approvals is a graph. The deciding factor is branches and rollbacks, not scale.

Before drawing, answer four questions or don't draw: which loops feed which other loops? Who owns the targets other loops chase? Who can veto or roll back a change? Which metrics may move and which must stay frozen? And pin whatever you build to reality — business outcomes, ground-truth datasets, human spot-checks — because a network of loops with no anchor is mutual drift in formation.

Multi-agent still wins where (Day-3 paper): genuine parallelism, real capability or security boundaries, abstraction layers that actually differ, adversarial check-and-balance setups, agents that must communicate with each other, heterogeneous models. Everything else that was built multi-agent by default simplifies to single-agent-with-skills by design.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['graphs', 'criteria', 'scope', 'horizon'],
    links: [
      { label: 'lecture 14', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-14-graph-engineering/' },
      { label: 'Day-3 paper — when multi-agent wins', url: 'https://www.kaggle.com/whitepaper-agent-skills' },
    ],
  },
  {
    title: 'WIP=1',
    category: 'Workflow',
    summary: 'Lecture-07 rule: one task active at a time, next starts only on green — plus the verified-completion gauge.',
    body: `Agents don't finish one thing first — they start five things at once, dilute attention across all of them, and finish none. Enforce WIP=1: exactly one task active at any time, the next starts only after the current passes end-to-end verification, and no drive-by refactors of feature B while implementing feature A. Overreach and under-finish are one cycle, not two problems: diluted attention leaves half-done code, half-done code raises complexity, complexity invites more overreach.

Hold the line with the gauge: verified-completion rate (verified tasks ÷ activated tasks), new work blocked while it sits below 1.0. Lines written correlate negatively with features finished — do less, but finish. The lecture's four methods, in full:

**1. Enforce WIP=1.** The most direct method: tell the agent explicitly that only one task may be active at any time.

\`\`\`markdown
## Work Rules
- Work on one feature at a time
- Only start the next feature after the current one passes end-to-end verification
- Don't "also refactor" feature B while implementing feature A
\`\`\`

**2. Define explicit completion evidence for every task.** Done is not "code is written" — it's "behavior verification passes." Every entry in the feature list carries its verification command:

\`\`\`
F01: User Registration
  Verification: curl -X POST /api/register -d '{"email":"test@example.com","password":"123456"}' | jq .status == 201
  State: passing
\`\`\`

**3. Externalize the scope surface.** A machine-readable file (JSON or Markdown) records every task's state — any new session reads it and knows immediately: which task is active, what behavior counts as done, what verifications passed.

**4. Monitor verified completion rate.** Track VCR = verified tasks ÷ activated tasks continuously, and block new task activations while VCR sits below 1.0.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['wip', 'scope', 'focus', 'completion-rate'],
    links: [
      { label: 'lecture 07', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-07-why-agents-overreach-and-under-finish/' },
      { label: 'lecture 08 — primitives', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-08-why-feature-lists-are-harness-primitives/' },
      { label: 'lecture 09 — no refactor before verified', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-09-why-agents-declare-victory-too-early/' },
    ],
  },
  {
    title: 'Agent-actionable errors',
    category: 'Tooling',
    summary: 'Lecture-09 pattern: errors that carry repair instructions — never "test failed", always what broke and where to look.',
    body: `Don't tell the agent "it's wrong" — tell it exactly what's wrong and how to fix it, so it self-corrects without human intervention. The Codex pattern: errors written for agents include repair instructions as a rule, not a courtesy.

Never \`"Test failed"\`. Always: \`"Test failed: POST /api/reset-password returned 500. Check that the email service config exists in environment variables. The template file should be at templates/reset-email.html."\` Name the failing call, the likely cause, and the concrete place to look — three facts, one message.

Canonical shape — what, why, fix:

\`\`\`
ERROR: Found direct import of 'fs' in src/renderer/App.tsx:12
WHY: Renderer process has no access to Node.js APIs for security
FIX: Move file operations to src/preload/file-ops.ts and call via window.api.readFile()
\`\`\`

Feed it with runtime signals, the objective basis under the words: did the app start and reach ready? Did critical paths execute? Were side effects (writes, files) correct? Were temporary resources cleaned up? Signals are the evidence; the repair instruction is the verdict the agent can act on.

Validate-retry-fallback (Day-2 paper): generated artifacts get schema-validated; on failure, retry with the exact validation error appended, capped — then fall back to a safe output so downstream never sees a malformed payload. Bounded correction inside one attempt, not a use-case retry.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['errors', 'feedback', 'self-correction', 'signals'],
    links: [
      { label: 'lecture 09', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-09-why-agents-declare-victory-too-early/' },
      { label: 'lecture 10 — what/why/fix', url: 'https://walkinglabs.github.io/learn-harness-engineering/en/lectures/lecture-10-why-end-to-end-testing-changes-results/' },
      { label: 'Day-2 paper — retry/fallback', url: 'https://www.kaggle.com/whitepaper-agent-tools-and-interoperability-with-mcp' },
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