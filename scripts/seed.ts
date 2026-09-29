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

Composition (Day-3 paper): real workflows don't fit in one skill — skills reference each other, pass state, and must avoid circular dependencies. Naive prompt chaining compounds errors; the industry answer is DAG orchestration with decoupled state (no accumulating history in prompts), a file message bus (structured schema references passed between nodes), and protected attention (payloads abstracted from text input, preserving capacity). Environment packaging via capability profiles: versioned personas per execution state (skills, tools, instructions, guardrails, model parameters), swapped in with strict teardown — unload instructions, flush stale variables, rebuild. Populate the graph from a fixed taxonomy: generator (intent to artifacts), reviewer and gate (deterministic blocks), pipeline (linear paths), inversion and recovery (force clarification before execution), domain wrappers (reference nodes teaching conventions).

![Architectural tradeoffs: linear pipelines, DAG orchestration, capability profiles](/uploads/6bf3ae5c-8825-4cdf-b9b3-63c29267ce4b.png)

Production readiness (Day-3 paper): past prototype, the model stops being the interesting part — skills become the engineering primitive that ships reliably. The full lifecycle arrives as skills that compose into the existing tool, not another portal: scaffold, code, eval, deploy, publish, observe.

![One install of lifecycle skills into any coding agent](/uploads/565b6fe5-9f26-46b4-a4c2-421614890ebd.png)

Three properties make skills the unit of improvement: conditional (loaded only on description match), composable (chaining downstream tools without mutual knowledge), owned (versioned folders with authors, improvement distributed). Compare against the alternatives:

![Improvement methodologies: model swap, prompt edit, fine-tune, new skill](/uploads/a534a124-53ef-41d6-a144-9e80cfa960e9.png)

New skills win on cycle time (hours to days), blast radius (bounded to matching turns), ownership (any domain team), and context tax (dynamic, on-demand). Inside any agent runtime, incidentally, barely any code is reasoning — the overwhelming share is operational infrastructure (permissions, compaction, delegation, storage). As models converge, the deterministic engineering around them is the differentiator, and the skill is its composable unit.

Settled versus emerging (Day-3 paper): the format is settled — an open standard adopted across every coding agent, chatbot, and framework that matters. The architecture around it is still emerging: co-loaded evaluation, library-level optimization, agent-driven creation, governance at scale. The format stays deliberately small so the interesting work happens around it — evaluation under realistic load, composition without the context window as a bus, agent-drafted skills with human review, institutional knowledge as a versioned testable library. Start small, start with knowledge already held, treat skills as code, measure what ships — and don't reach for multi-agent when a skill will do.`,
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
    title: 'Meta-skills',
    category: 'Knowledge',
    summary: 'Day-3 territory: skills that author, harvest, improve, and evolve other skills — gated by evals, graduated like any skill.',
    body: `Once a working library exists, the agent can help write, evaluate, and improve skills too. Meta-skills — skills whose job is other skills — fall into four buckets. Authoring: from a workflow description to a draft skill. Assisted authoring from traces: watch the agent succeed a few times, then turn the trace into a skill — the human confirms rather than writes.

![Trace harvesting: successful production histories become procedural memories](/uploads/9b482976-6ba5-41f4-bb47-5a036a201efe.png)

Improvement: existing skill plus failing eval cases in, proposed edits out — bounded experiments kept only on metric improvement.

![Gated improvement: revisions pass evals and human spot-check before promotion](/uploads/d22ed8b1-1992-4862-a2e5-77f3694596c1.png)

Library evolution: the agent finishes a task it had no skill for, notices the recurring shape, and proposes growing the library.

Guardrails, because an agent editing its own skills optimizes whatever metric it is pointed at, including gameable ones: evaluation quality is what keeps this honest (trigger accuracy, regression tests, human spot-checks). Agent-written entries enter at draft tier regardless of confidence and graduate the same ladder. Keep a human on the first edits — overfit descriptions and broken downstream skills are the mistakes humans catch in seconds. And don't start here: manual authoring first; pointing an agent at an empty folder for fifty skills is the fastest route to a bad library. The settling pattern: humans write first versions, meta-skills handle maintenance, full self-extension stays experimental until the gates are tight.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['meta-skills', 'skills', 'self-improvement', 'gated'],
    links: [
      { label: 'Day-3 paper', url: 'https://www.kaggle.com/whitepaper-agent-skills' },
    ],
  },
  {
    title: 'Skill cheatsheet',
    category: 'Knowledge',
    summary: 'Day-3 Appendix A, whole: template, structure, naming, description, rules, quality, do/don’ts, smells, checklists.',
    body: `The printable standalone: everything a team needs to author skills, in checklist form.

## The minimal SKILL.md

Copy-paste, adjust placeholders, done:

\`\`\`markdown
---
name: skill-name
description: |
  [What it does in one verb-led sentence.] Use this skill when the user
  [trigger phrase 1], [trigger phrase 2], or [trigger phrase 3].
  Do NOT use for [anti-trigger 1] or [anti-trigger 2].
version: 1.0.0
license: MIT
allowed-tools: [Optional] Read Bash Write
metadata:
  author: [Optional] your-handle
---

# Skill Name

## When to use
- [Concrete scenario]
- [Concrete scenario]

## When NOT to use
- [Out-of-scope scenario]

## Workflow
1. [Step]
2. [Step]
3. See \`references/advanced.md\` for [edge case].

## Examples
- Input: "..." → Output: "..."

## Output format
- Use \`assets/template.md\` etc.

## Anti-patterns to avoid
- Don't [...]
\`\`\`

## The folder structure

\`\`\`text
skill_name/
├── SKILL.md            # Required: YAML frontmatter + markdown instructions
├── scripts/            # Optional: executable helper scripts (Python, Bash)
├── references/         # Optional: supplementary context loaded as needed
├── assets/             # Optional: files used in output (templates, resources)
├── ...                 # Any additional files or directories
\`\`\`

## Naming

- Directory name: snake_case
- Skill name: kebab-case
- Prefer gerund form: processing-pdfs, not pdf-processor
- Avoid generic names: helper, utils, tools, data
- Avoid vendor prefixes: claude-*, gemini-*, anthropic-*
- Avoid internal jargon outsiders won't recognize

## The description field

The description is the routing algorithm. Spend more time here than anywhere else.

- State what it does AND when to use it
- Front-load trigger keywords ("Generate a commit message…", not "This skill helps with…")
- Include when NOT to use to prevent over-triggering
- Be pushy when the model under-triggers
- ≤200 chars for API; ≤1024 chars in YAML. Most authors aim for ~50 words

## The five rules

1. One skill, one job. If you cannot describe what the skill does in one sentence, it is two skills. Decompose before writing.
2. Descriptions are an interface. The agent picks skills by reading descriptions. A vague description means an unused skill.
3. Skills are dependencies. Treat them like libraries. Version them, pin them, review them in PRs. A skill without a test is a hope, not a capability.
4. The right team owns the right skill. Domain experts own domain skills. Do not let the AI team become a bottleneck for the organization's domain knowledge.
5. The agent runtime is interchangeable. Do not tie skills to one runtime. Portability is part of the value.

## The quality principles

1. Run the task yourself first. Real failure produces signal. Speculation produces noise.
2. Give the reason, not just the rule. Models generalize wonderfully to edge cases when they understand why an instruction exists. If you find yourself typing "ALWAYS" or "NEVER" in caps, pause and try explaining the rationale instead.
3. Every line should earn its place. Keep gotchas, exact commands, business logic, anti-patterns. Cut boilerplate the model already knows such as "always validate output".
4. One skill, one job. If the description needs "and" between unrelated capabilities, split it.
5. Make instructions verifiable. If the agent can't tell whether it followed the rule, the rule is too vague.
6. Bundle what repeats. Helper code the agent keeps re-deriving belongs in scripts/.

## Do's and Don'ts

Do:

- Start small and concrete
- Spend disproportionate time on the description field. It is the routing algorithm. Always include what it does, when to use, and when not to use
- Trust progressive disclosure
- Bundle deterministic work in scripts/, not as instructions
- Treat Skills as code
- Remember: Skills + MCPs, not Skills vs. MCPs
- Have test cases and controlled, programmatic evaluation

Don't:

- Write vague descriptions like "helps with documents". Use specific verbs, trigger phrases, and a when-not-to-use clause
- Write SKILL.md bodies over 5,000 words. Move detail to references/
- Hard-code paths or secrets
- Embed "always do X" rules that are more appropriate for AGENTS.md
- Install untrusted third-party libraries or Skills without scanning
- Reinvent MCP as scripts

## Skill smells (revise if you see these)

- Over 5,000 words. Probably two skills, or reference material that should live in references/
- Two domain teams could plausibly own it. Not yet decomposed. Split along team boundaries
- You can't write three test cases for it. Description is too vague; skill does too many things
- It does not reference any other resource. Might just be a long instruction that belongs in the system prompt
- You keep adding "edge cases" sections. Each edge case probably wants its own skill
- Its description starts with "a helpful skill for…". Rewrite. The description should name the trigger, the inputs, and the output

## Eval coverage checklist

A skill is "evaluated" only when all four are satisfied:

- Trigger. Positive AND negative test cases. Target 90% trigger accuracy
- Execution. Correct outputs across a representative range of inputs
- Regression. Adding this skill causes zero drops in the existing library suite
- Token budget. Co-loaded with 5 to 15 frequently-active skills, does not degrade unrelated turns

Any failure holds the skill at the draft tier, regardless of happy-path performance.

## Deployment checklist

- Frontmatter validates (lint passes)
- Description includes what + when + when-not
- Scripts have unit tests passing in CI
- Eval suite passes in CI with min-pass threshold
- Security scan clean (no secrets, no untrusted deps)
- Description reviewed by someone other than the author
- Cross-tool install paths tested if shipping publicly
- Org-level admin provisioning updated (if applicable)

## One-line mental model

System prompt = instinct. AGENTS.md = project README. Tools / MCP = hands. RAG = library. Skills = the runbook the experienced colleague hands you on day one, and that the AI never forgets.

## Where to start tomorrow

1. Take your most experienced practitioner aside for an hour. Ask them to narrate three workflows they do regularly. Record it.
2. Pick the most repeated workflow. Run the prompts yourself, without any skill loaded. Note where the agent fails.
3. Draft a SKILL.md from the transcript. Write three eval cases (two positive, one negative) before drafting the body.
4. Ship to a read-only tier. Test in production-like conditions. Iterate the description until trigger accuracy clears 90%.

Repeat. Build the library one workflow at a time. Resist the urge to let an LLM generate fifty skills on day one.`,
    considered: true,
    implemented: false,
    wanted: false,
    tags: ['skills', 'cheatsheet', 'reference', 'authoring'],
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

Document every variable the project actually depends on in the entry file. Undocumented env dependence is implicit knowledge, and implicit knowledge is what agents trip over. Practice context hygiene: sensitive values travel as placeholders resolved from the environment at runtime — never pasted into prompts, templates, or test suites — so an agent filling gaps from context finds sterile tokens instead of live secrets.`,
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

Instructions live in four layers, never one: the chat box (ephemeral, session orchestration only — never a 100-page design dump), the versioned specs folder (task designs and contracts the agent indexes itself), skills (reusable triggered workflows), and system prompts (global identity and persona). The entry file is the shared cross-tool foundation when several agents work the same repo; tool-specific files keep highest priority for their own settings. Dumping everything into one layer exhausts context, fragments attention, and guarantees staleness.

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

Doc, executable, and norm agreeing is rare enough to state outright — most repos have two of three, and the missing one is usually the doc. Keep batches small and never modify tests and implementation in the same step — the test stays an objective baseline, and small diffs stay reviewable (a security control as much as a courtesy). Fix forensically: report evidence, not symptoms (log lines and failing calls, not "it broke"); compare versions to isolate the break and trace the flow (request → gate → failure) before touching code; reproduce first with a failing test or request and keep it in the suite so the bug cannot return; repair the root cause only — no drive-by cleanup, renames ship as a separate task. (The errors mod covers the reverse direction: failures that carry their own repair instructions.)`,
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

Start manual: one log line per task (claimed-done + independent verdict, plus turns-to-converge, converged-or-abandoned, and token cost), gap ratio over a window, beginning with any task where "done" felt cheap. Sessions that converge in few turns are the success cases; abandoned sessions are the most informative failures — far more than turn-level errors. Instrument later: append results automatically from your checks, review the ratio on a cadence, and treat a widening gap as the signal to strengthen verification. This sensor reports on the sensors themselves — build it the day a false-done slips through green.`,
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

With a vision-capable model the agent can look at the screenshots itself — same sensor, strictly stronger reader. Run the debugging browser in an isolated profile with no shared logins or live sessions: step-by-step visual instructions ("point at what breaks, define what fixed looks like") with zero context leakage into production.

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

Adaptations that matter: facts through search skills instead of sub-agents; the tracker is local markdown instead of an issue tracker; deliberate steps never model-invoked, so the pipeline never runs accidentally. Generation starts with a proposed structure, stack, and version pins — confirmed before code — with tests, docs, and logging in the brief from the start. A spec is only as honest as its open questions.

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

Three placements: mid-loop via shell (facts, diagrams, browser evidence), the gate left-shifted into check, one-shot ops documented with commands and receipts. Show the work: data operations cite the exact query or command that produced the output — receipts, not prose. Route external fetches through governed paths (offline caches, sanitized crawlers) rather than raw interactive browsing — a domain allowlist cannot stop injected instructions hiding inside an otherwise legitimate page. Portability rule: CLIs run through the shell every harness has — they are the one guide category that survives a harness switch unchanged, unlike runtime-specific extensions. New controls ship as skill plus script first.`,
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
3. **Secrets scan** — credential patterns over tracked files, file:line plus fix, values never printed. Must catch a live secret push on its first run to earn the name. Pair it with content scanning for invisible payloads (zero-width characters, homoglyphs) on ingested code — hidden instructions bypass human review and replicate faster than eyes can follow. The supply-chain half lives in the Hallucinated-dependency guard mod.
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

Review-augmentation posture: the agent as first-pass reviewer (bugs, style, vulnerabilities, perf) before human eyes — never replacing human judgment on design, maintainability, and alignment, but cutting reviewer load. Generated code matches house style (naming, error handling); multi-file edits are confirmed against a visible diff. AI-aware deployment closes the loop: health monitoring, automatic rollback, risk prediction from change scope.

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

Quality flywheel (SDLC paper): evaluate against a benchmark suite, diagnose failures by clustering root causes, optimize the prompts or tools that caused them, verify fixes against a regression suite, monitor production traffic for new failure modes. Each cycle compounds — the ledger is the data it feeds on. Mine user corrections as labeled failure data: every "no, not like that" is a free failure example — cluster them and the systematic gaps surface faster than any synthetic benchmark.

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

Every surviving rule documents its source (why added), applicability (when needed), and expiry (when removable) — audit on cadence and delete. Historical incident notes don't belong in instructions at all: convert them to test cases or delete them. Signal-to-noise is the metric; the entry file is a router, and routers stay thin.

Context debt (Day-3 paper): bloating descriptions with deterministic imperatives ("ALWAYS DO X") burns attention — models learn to ignore walls of capitalized rules exactly like humans ignore warning-text walls. Shift intelligence left: distill subjective judgments out of prompts into standard, testable scripts. Write software, not rules — replace negative instructions with deterministic constraints that make invalid actions impossible. Decouple state the same way: never use the context window as a database; pass URIs and pointers through the filesystem or message bus.`,
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

Two riders: minimal-but-complete (every entry earns its place by changing a decision; every fresh-session question still has an answer) and update-with-code (docs beside the code get noticed when the code changes; stale docs are worse than none — they send the agent the wrong way while it feels right). Describe interfaces in structured comment form so agents grasp what a function does without reading its body.`,
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
    body: `Run agent state like database transactions. Atomicity: a logical operation ships whole once verified, or is discarded — never half-merged. Checkpoint before mutating: snapshot version control before agent edits so failed verification rolls back instead of compounding. Consistency: define verifiable predicates (tests pass, lint clean) and check them after each operation; inconsistent states don't get committed. Isolation: concurrent agents get their own progress files or branches — shared mutable state is where toes get stepped on. Durability: anything that must survive the session goes in git-tracked files; what lives only in session memory doesn't count.`,
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

Immediate cleanup every session (temp files, debug logs, commented code — "clean up later" means never, and the next session can't tell intentional from temporary), periodic cleanup weekly (structural scan, quality-doc refresh, drift benchmarks). Docs ride with code: the handoff updates the changelog and any behavior docs the change invalidated — unmaintained docs teach the next session to hallucinate. Cleanup ops must be idempotent — safe to re-run, no side effects on repeat:

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
  {
    title: 'High-stakes confirmation',
    category: 'Workflow',
    summary: 'Day-4 practice: irreversible actions need scoped identity plus a plain-language intent-to-steps summary — never a blind approve button.',
    body: `The standing failure behind every agent incident log: an over-privileged agent, tricked or merely literal-minded, executing something irreversible while the human clicked "approve" on code they never read. Vague prompts produce broad workflows; shared long-lived credentials turn that breadth into ambient authority — and a hidden instruction pasted in with a forum snippet (the confused deputy) spends it on the attacker's behalf. The canonical warning: an unsupervised browsing subagent, told to create a button, clicked it live, followed a hallucinated connection to a legacy system with no safeguards, and mailed false content to fifty colleagues — fulfilling its directive with whatever data lay in context, unchecked. Never run an agent in auto-approve against live systems.

Three controls, in order:

1. **Least privilege by construction.** The agent never inherits the operator's full permissions. Every task runs under its own scoped identity — observably agentic, never the user's delegated credentials — with fresh, hyper-restricted grants covering exactly the data and tools that step needs, expiring when the step ends. File access follows a deny-by-default allowlist: named project directories readable and writable, secrets, build scripts, and deployment manifests off limits always.

2. **Structured elicitation, not approve/deny.** High-stakes actions — production data, money movement, identity configuration, anything irreversible — cannot ride a bare confirmation button. The agent must ask in context, and the request carries two boundaries: a second-factor human act (at enterprise scale a hardware-key touch; at local scale an explicit typed confirmation, never a cached yes), and a plain-language summary of what will happen.

3. **The plain-language diff.** Before the tool runs, the generated plan is translated back into ordinary language mapping the original fuzzy intent to the proposed execution steps: what it touches, what it excludes, what can be undone. Compilation success is not comprehension — "it runs, ship it" is the fallacy this control exists to break. The human authorises the meaning, not the syntax.

![Secure vibe-coding agent framework: seven-pillar foundation, code-and-execution workflow, active defense layer](/uploads/08aeab65-0bfa-4e25-865c-f9b44fb8e519.png)

Parked at enterprise scale, adopted in miniature here: scoped identities and hardware attestation are the platform's job; the allowlist, the elicitation ritual, and the plain-language diff are ours. Confirmation fatigue is the failure mode to watch — if routine steps start demanding ceremony, the ceremony stops working; reserve it strictly for the irreversible.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['high-stakes', 'approval', 'least-privilege', 'security'],
    links: [
      { label: 'Day-4 paper', url: 'https://www.kaggle.com/whitepaper-vibe-coding-agent-security-and-evaluation' },
    ],
  },
  {
    title: 'Hallucinated-dependency guard',
    category: 'Tooling',
    summary: 'Day-4 supply-chain control: vet every new dependency against the real registry, pin versions, gate on manifest — slopsquatting never reaches the build.',
    body: `Generative agents invent dependency names that do not exist — and attackers watch for those hallucinations, publishing malware under the exact fabricated names so the next agent run pulls it straight into the build (slopsquatting). Because agents can rewrite dependency graphs without human confirmation, one confident fiction becomes a supply-chain breach.

The guard has four layers:

1. **Vetted sources only.** New dependencies resolve exclusively against known registries or an internal mirror — never whatever name the model produced. A name that does not exist upstream is rejected before anything downloads.
2. **Pinned versions.** Ranges float toward whatever was published most recently, which is exactly where the malware sits. Pin exact versions cryptographically and let upgrades arrive as deliberate changes, not ambient drift. Models also propose stale versions from before their knowledge cutoff — feed current documentation to the agent (retrieved docs or version notes alongside the spec) and double-check every proposed version number.
3. **Composition scan at the gate.** Every build verifies the dependency manifest and artifact signatures before anything advances toward production — the deterministic checkpoint no advisory warning can replace.
4. **Contained, governed execution.** Generated code first runs in an ephemeral, isolated sandbox whose state resets between runs, so a compromised script cannot persist or reach the host. Network egress travels governed paths only — offline caches or pre-sanitized fetchers — because a domain allowlist cannot stop injected instructions hiding inside an otherwise legitimate page.

Enforcement split that keeps velocity: advisory hints where the developer types (a linter noting an unvetted dependency), unyielding checks in the pipeline where nothing gets bypassed in a hurry. The local companions: the scheduled dependency sensor watches what is already installed; this guard watches what the agent tries to add.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['supply-chain', 'dependencies', 'sandbox', 'security'],
    links: [
      { label: 'Day-4 paper', url: 'https://www.kaggle.com/whitepaper-vibe-coding-agent-security-and-evaluation' },
      { label: 'Wiz — secure vibe coding guide', url: 'https://www.wiz.io/lp/the-technical-guide-to-secure-vibe-coding' },
    ],
  },
  {
    title: 'Evaluating intent-driven agents',
    category: 'Knowledge',
    summary: 'Day-4 method, whole: why vibe eval differs, seven dimensions, eight-method matrix, observability prerequisite, convergence over turns.',
    body: `Security proves the agent did no harm; evaluation proves it delivered value. An agent can pass every security check while misreading intent, ignoring project conventions, or silently degrading the experience — and vibe-coding evaluation is its own problem, distinct from both deterministic testing and other agent categories.

Why it is different — three constraints shape everything below:

- **The underspecification gap: there is no spec.** "Make it load faster" is not a test case. The prompt leans entirely on the model's latent knowledge and judgment to reconstruct the unstated requirements — so the first job of evaluation is checking whether it reconstructed the right ones.
- **The user often cannot validate the output.** Nobody reviews hundreds of generated lines in real time, expert or not. The gap between "the agent thinks it succeeded" and "the code is actually correct" is widest here, and closing it is the central work.
- **The session is iterative and the codebase is state.** Every turn mutates real files; bad early decisions compound. Evaluation must cover the full arc of a multi-turn session on a living codebase, not isolated turns.

![Vibe-coding evaluation framework: why it differs, what to evaluate, how to evaluate](/uploads/8772221b-f92b-4ba3-8dc1-03fad4b90658.png)

What to evaluate — seven dimensions in two groups, plus one transversal:

- **User-facing (what the developer experiences):** 1. intent satisfaction — did it build what was meant, not just what was said (the hardest; the user judges everything on this); 2. functional correctness — builds, runs, passes tests (the floor, not the ceiling; gameable by deleting or mocking tests); 3. visual and behavioural correctness — for UI output the artifact is the rendered page, not the code; 4. cost and efficiency — tokens, latency, tool calls, and corrections-to-converge (one-turn success is a different product from eight corrections).
- **Internal (invisible to the user):** 5. code quality and convention match — idiomatic, style-consistent, maintainable (a passing diff that violates house style is still a failure); 6. trajectory quality — a sensible path: the right files read first, a coherent edit sequence, the right tool each step (correct output via bad reasoning is fragile); 7. self-repair behaviour — when the build fails or the user says "not like that," does it recover or compound?
- **Transversal:** safety and responsible AI cuts across all seven — vulnerabilities, leaked credentials, license exposure, refusal behaviour, output safety — scored alongside each dimension, never as a separate gate.

![Evaluation dimensions: four user-facing, three internal, safety transversal](/uploads/e0995662-f112-4bc2-ac7c-b4dd0042cda3.png)

How to evaluate — no single method covers all dimensions; production pipelines combine them (each method described in full in the How to evaluate mod):

- **Automated functional testing** (build, suite, linters) — the cheapest signal; covers functional correctness and rule-checkable quality.
- **Security and safety evaluation** — static scanners plus scripted adversarial refusal probes; transversal.
- **Model-as-judge** — a peer model scoring outputs against rubrics, or inspecting the trace for plan coherence; covers intent, style, trajectory. Two non-negotiables at scale: swap reference and actual to kill ordering bias, and calibrate against human ratings.
- **Browser-based testing** — scripted multi-step workflows against the deployed app plus screenshot comparison; the method for visual and behavioural correctness. Judge the rendered artifact, not the code: a multimodal judge looking at the page catches broken layout, contrast, and states that code-level checks miss entirely, while assertions catch broken interactivity.
- **Trajectory inspection** — reasoning, tool calls, and retrievals from execution traces; covers trajectory quality and self-repair.
- **Human review** — sampled sessions scored by qualified reviewers; the only ground truth for intent. Does not scale — used to calibrate the other methods.
- **Online evaluation** — sample live traffic against the same rubrics; bias sampling toward high-cost sessions, many-correction sessions, and abandonments, since flat sampling misses the long tail.
- **Standardised benchmarks** — shared task sets for cognitive calibration only. The tradeoff is overfitting: top scores on static sets prove nothing about messy human intent. Never a replacement for custom intent evaluation.

![Evaluation methods mapped to their recommended dimensions](/uploads/8a0296b6-f62e-442a-8a23-21e037f5464d.png)

Observability is the prerequisite: without execution traces the agent is a glass box painted black (the full section is quoted in the Observability prerequisite for evaluation mod). One trace per session, reasoning spans before each action, tool spans with arguments and latencies — and tail-based sampling that drops routine successes while keeping errors and repair loops, since full capture drowns storage. Cost accounting rides the same spans: tokens, latency, and repair-loop spend per session.

Four applied tips that survive contact with real sessions:

1. **The session opening is the rubric.** With no spec, derive 3–5 acceptance criteria from the first user messages automatically, then score every subsequent turn against them — the only practical intent metric at scale.
2. **Judge convergence, not turns.** The question is never "was turn 4 correct" but "did the session converge, in how many turns, at what cost, or was it abandoned?" Abandoned sessions are the most informative failures.
3. **Mine corrections as labeled data.** Every "no, not like that" is a failure example produced free; cluster them and the systematic gaps surface faster than any synthetic benchmark.
4. **Local mapping:** artifact judging lives in the browser-behaviour sensor, rubric judging in the review step, functional and security scanning in the static checks, convergence fields in the verification-gap log, correction mining in the steering loop, trajectory scoring in skill evaluation. This mod is the map; those mods are the territory.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['evaluation', 'intent', 'trajectory', 'judge', 'convergence'],
    links: [
      { label: 'Day-4 paper', url: 'https://www.kaggle.com/whitepaper-vibe-coding-agent-security-and-evaluation' },
    ],
  },
  {
    title: 'How to evaluate',
    category: 'Knowledge',
    summary: 'Day-4 section, quoted whole: the seven evaluation methods with recommended dimensions — no single method covers everything, pipelines combine several.',
    body: `The seven dimensions are not all measurable the same way. No single method covers everything, so production pipelines combine several. The figure below summarizes the evaluation methods and the dimensions each is recommended for; the rest of the section describes each in detail.

![Evaluation methods mapped to their recommended dimensions](/uploads/8a0296b6-f62e-442a-8a23-21e037f5464d.png)

**Automated functional testing.** Run the build, the test suite, and the linters on the agent's output. The standard tooling does most of the work here, pytest, jest, eslint, mypy, plugged into the project's CI pipeline. This is the cheapest signal available, recommended for functional correctness (dimension 2) and the rule-checkable parts of code quality (dimension 5).

**Security and safety evaluation.** Combine static security analysis on the generated code with adversarial probing for refusal behaviour. This is cross-cutting, it scores safety and responsible AI alongside the other dimensions, not as a separate gate. The tooling splits in two: static scanners like Snyk and Semgrep find vulnerabilities, git-secrets catches credential leaks, and scripted red-team suites test whether the agent refuses clearly harmful requests.

**LLM-as-judge and Agent-as-judge.** Use a model to score outputs against rubrics. Recommended for the dimensions where rules don't quite capture the right answer, intent satisfaction (dimension 1), code quality and style (dimension 5), and trajectory quality (dimension 6). In practice that means Gemini scoring an output against the original user prompt, or an agent-as-judge inspecting the trace for plan coherence.

**Browser-based testing.** Run multi-step workflows against the deployed app and observe what happens. Recommended for visual and behavioural correctness (dimension 3) on UI-producing agents. The techniques are well-established in software testing: Playwright scripts that interact with the rendered UI, screenshot comparison against a reference.

**Trajectory inspection.** Analyze the agent's reasoning, tool calls, skill invocations, and retrievals. Recommended for the internal dimensions, trajectory quality (dimension 6) and self-repair behaviour (dimension 7). The substrate is OpenTelemetry traces with span-level tool-call data, surfaced through trace-replay tools that bind each model invocation to the actions that followed.

**Human review.** Sample sessions for direct review by qualified reviewers. Recommended for intent satisfaction (dimension 1, where humans are the only ground truth), code quality (dimension 5, the traditional domain of code review), and safety and responsible AI calls that need nuanced judgment. Doesn't scale; mainly used to calibrate the other methods. In practice that means structured annotation by senior engineers on review queues filled by online sampling.

**Online evaluation.** Sample live production traffic and score it against the same rubrics used in offline eval. Covers all dimensions at sample rate. The trick is sampling well: a flat 1% misses the long tail, so bias toward high-cost sessions, sessions with many corrections, and sessions the user abandoned.

Local mapping (where each method lives here): functional testing in the static checks; security and safety in the static checks plus the secrets scan; model-as-judge in the review step; browser-based in the browser-behaviour sensor; trajectory inspection in skill evaluation; human review in the safeguards plus the review step; online evaluation in the verification-gap log and the steering loop. Tests and evaluations are different instruments: unit tests ask binary questions that catch deterministic regressions; evaluations ask scored questions with tolerance bands that catch behavioural drift. New methods should arrive the way this section did — quoted, then mapped, then built.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['evaluation', 'methods', 'testing', 'review', 'sampling'],
    links: [
      { label: 'Day-4 paper', url: 'https://www.kaggle.com/whitepaper-vibe-coding-agent-security-and-evaluation' },
    ],
  },
  {
    title: 'Observability prerequisite for evaluation',
    category: 'Tooling',
    summary: 'Day-4 section, quoted whole: tracing the thought, tracking costs, tail-based sampling — without it, agent failures look monolithic.',
    body: `To evaluate an agent's internal reasoning, developers must possess the capability to see it. Observability is the absolute prerequisite for Glass Box evaluation; without it, agent failures appear as inexplicable monolithic events.

- **Tracing the Thought:** Modern agent observability relies on OpenTelemetry to capture non-deterministic flows. agent.session spans capture the entire task duration, agent.think spans record the internal reasoning and prompting cycle prior to action, and agent.tool spans log the specific arguments and latencies of environmental interactions.
- **Tracking Costs:** Observability provides granular data to calculate true operational costs. By aggregating span attributes, teams can precisely measure token consumption, inference latency, and the cost of self-repair loops.
- **Dynamic Tail-Based Sampling:** Capturing 100% of traces in production quickly overwhelms storage budgets. Tail-based dynamic sampling allows the collector to evaluate the full trace after completion, dropping routine successes while retaining traces containing errors or excessive self-repair loops.

Local mapping: the session → task → verification trace shape lives in the observability mods (harness-collected signals, sprint contracts, evaluator rubric, queryable per-task stacks); per-turn token measurement in the context tooling; repair-loop cost in the loop-cost audit. Collect signals in the harness, not from the agent — agents don't log what they don't know they need.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['observability', 'traces', 'spans', 'sampling', 'costs'],
    links: [
      { label: 'Day-4 paper', url: 'https://www.kaggle.com/whitepaper-vibe-coding-agent-security-and-evaluation' },
    ],
  },
  {
    title: 'Instruction format sensitivity',
    category: 'Knowledge',
    summary: 'Day-5 finding, quoted: generic markdown can cost ~40% performance; narrative in Markdown, deep structure in YAML — formatting is token economics.',
    body: `Agents are extremely sensitive to how instructions are formatted: a 2026 study (Ouyang et al., "SkCC: Portable and Secure Skill Compilation for Cross-Framework LLM Agents") found up to a 40% performance drop when using generic, unoptimized Markdown files. The researchers' answer is compilation — a single-source instruction file rendered into each model's optimal target format in milliseconds.

The best formatting strategy the study demonstrates is hybrid Markdown + conditional YAML: clean Markdown headers anchor the model's attention for narrative instructions, while any structured configuration or data schema with a nesting depth greater than 3 switches to YAML. For deeply nested configurations, YAML achieves 51.9% parsing accuracy, compared to 43.1% for JSON and 33.8% for XML. Rendering deep specifications in YAML while keeping prose in Markdown bypasses the reasoning "format tax" of heavy JSON inputs — maximum accuracy at optimal token economics.

Local mapping: this rule applies everywhere instructions live — the entry file, skill bodies, and the specs folder. Keep nesting shallow by construction; when structure must go deep, reach for YAML, not JSON. The entry-file audit owns how much gets written; this mod owns what shape it takes. New formatting claims arrive the same way this one did — measured, then encoded.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['formatting', 'yaml', 'tokens', 'instructions'],
    links: [
      { label: 'Day-5 paper', url: 'https://www.kaggle.com/whitepaper-spec-driven-production-grade-development-in-the-age-of-vibe-coding' },
      { label: 'SkCC study (Ouyang et al.)', url: 'https://arxiv.org/abs/2605.03353' },
    ],
  },
  {
    title: 'Behavior-driven specs',
    category: 'Knowledge',
    summary: 'Day-5 method: Gherkin Scenario/Given/When/Then plus the good-spec checklist — design, visuals, why, scenarios — reviewed before generating.',
    body: `Code is disposable; the specification is the asset. With a rock-solid spec the whole codebase regenerates on demand — so review the blueprint, never mourn the code, and trash freely when requirements move.

A Behavior-Driven Development (BDD) specification turns vague, ambiguous ideas into a precise design an agent can build without guessing. BDD describes exactly how a system should behave from the user's perspective, in plain structured natural language, before any code is written.

The syntax is Gherkin: a declarative Scenario / Given / When / Then template that forces thinking in State → Action → Outcome terms. No vibes, no guessing — the agent rides a strict track.

A good specification for generating a new project contains:

- **The full technical design.** Never "make a login page" — break it down: requirements, data schemas, and the API contracts that let the parts talk to each other.
- **Visual aids.** Diagrams plus the specific tools and libraries with version numbers.
- **Background information.** The why behind the what — it lets the agent think forward to steps you will likely need next.
- **Scenarios.** What good looks like, what wrong looks like, and the edge cases.

Review the design before generating: have humans read and critique the plan first — a logic flaw caught in prose costs nothing next to thousands of generated lines built on top of it. Once reviewed, the spec lives versioned in the project's specs folder as the shared source of truth for humans and agents alike.

Treat tokenization as a hard physical constraint: every character, newline, and indentation space converts directly into budget, latency, and attention capacity. Keep the specs folder a lean, compiled instruction set — human-readable prose balanced with flat, targeted structure blocks, repetitive ceremony trimmed. (The measured side of this rule lives in the Instruction format sensitivity mod.)

Local mapping: behavior scenarios are the content that fills a sprint contract; the specs folder is knowledge-next-to-code at project scale; scenario lists double as acceptance criteria in the task breakdown.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['bdd', 'gherkin', 'specs', 'scenarios'],
    links: [
      { label: 'Day-5 paper', url: 'https://www.kaggle.com/whitepaper-spec-driven-production-grade-development-in-the-age-of-vibe-coding' },
      { label: 'Gherkin reference', url: 'https://cucumber.io/docs/gherkin/reference' },
    ],
  },
  {
    title: 'Code Reviews',
    category: 'Workflow',
    summary: 'Day-5 section, quoted whole: high-velocity integration — bundled summaries, blueprint ownership, conditional LGTM, no-blame, review skills in CI — plus the code-check skill template.',
    body: `To survive the volume and scale of AI-generated commits without burnout, teams need new guidelines for the shift from writing code to integrating it. Volume breaks integration three ways: merge conflicts (several landings in the same file within the hour), review gridlock (a giant change becoming a Russian doll of dependent sub-changes), and context fragmentation (an agent quoting an outdated snapshot after a teammate renamed the function).

Strategies for high-velocity integration:

- **Bundled summaries and risk assessments.** Require every change to include an AI-generated snapshot of what changed, potential breakage points, and a risk assessment — a markdown file or a detailed commit description that focuses human reviewers on architectural impact rather than lines.
- **Reimagined ownership.** Shift human review from nitpicking style on disposable, agent-written code to ensuring the integrity of the architectural blueprints. Style rides on automated tooling: shared syntax linters or workspace-specific stylebooks.
- **The "Conditional LGTM".** A reviewer approves contingent on all automated tests passing; if the suite turns green, the code merges automatically — no 12-hour cross-timezone wait.
- **No-blame culture.** In high-velocity environments the most prolific producer becomes the scapegoat for bugs and merge conflicts. Attribute those issues to broken integration processes, not to the individual driving the agent.
- **Agent coding reviews.** Build a skill that reviews code — and skills that respond to reviews — triggered automatically on every change by the CI pipeline. (The managed / hybrid / custom deployment spectrum lives in the Deploying Agents That Watch Your Repo mod.)

Split work so members rarely touch the same files — clear ownership of APIs versus UX, for example. Where overlap is unavoidable, the designated part owner handles the final synchronization. (And the open question behind all of it: with a squad of agents at hand, which teamwork is still load-bearing, and which is ritual?)

A review skill template (trigger from CI in non-interactive mode, post the verdict as a comment):

\`\`\`markdown
Act as a Senior Software Engineer and Security Researcher. Review the provided
code for this PR or diff using these strict criteria.
Fetch the change from version control first (e.g. \`gh pr view <PR NUMBER>\`).
Then analyze, then review:

1. **Critical Vulnerabilities:** hardcoded secrets, injection, XSS, broken authentication.
2. **Logic & Efficiency:** off-by-one errors, infinite loops, redundant calls.
3. **Readability:** naming, breaking down mega-functions.
4. **Edge Cases:** null inputs, network failure — what happens?

Output format:
- **Description:** what is this change doing, in detail.
- ISSUES: Critical (stop-ship) · Warnings (smells, style) · Best Practices (lines to refactor) · Quick Win (biggest improvement in one sentence).
- With no issues: Description plus LGTM.
\`\`\`

Local mapping: the review step owns the semantic half; the static checks are the automated half the Conditional LGTM waits on (pass-state gating in the task breakdown); style enforcement lives in lint and domain rules; ownership split mirrors the isolation rule in agent state.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['code-review', 'integration', 'ownership', 'review-skill', 'risk'],
    links: [
      { label: 'Day-5 paper', url: 'https://www.kaggle.com/whitepaper-spec-driven-production-grade-development-in-the-age-of-vibe-coding' },
    ],
  },
  {
    title: 'Deploying Agents That Watch Your Repo',
    category: 'Tooling',
    summary: 'Day-5 section, quoted whole: continuous review agents across three tiers — managed, hybrid, custom — and graph-native understanding at full scale.',
    body: `You can write a great review prompt. But who runs it on every change, every nightly sweep — without a human pushing the button?

A code review skill runs when invoked from inside the IDE. The next step is deploying review skills as continuous code analysis agents — services that watch the repository, react to events (change opened, nightly cron), and post findings back without anyone asking. They catch what tired humans miss on a Friday afternoon: a dependency with a fresh vulnerability, a TODO from six months ago that quietly became a security gap. Once a team ships AI-generated changes at volume, a continuous reviewer is the only thing that scales with the output. The question is how custom you need to go — and the answer is a spectrum with three tiers, each trading control for simplicity.

The three tiers differ in who owns the runtime and who writes the review criteria:

- **Tier 1 — Managed.** The off-the-shelf path: enable a SaaS reviewer on the forge and every change gets AI comments on style, bugs, and security out of the box. No prompts to write, no infrastructure to manage; pay per seat. The trade: you get the vendor's review opinions, not yours — a generic reviewer misses what matters to a team with a strict house style or a domain-specific risk profile.
- **Tier 2 — Hybrid.** The middle path, and the right starting point for most teams. Write your own review skill, commit it to the repo, and trigger it from a CI action that runs the agent CLI in non-interactive mode and posts the result as a comment. The runtime belongs to the CI provider; the prompts, model choice, sandboxing, and review criteria belong to you.
- **Tier 3 — Custom.** The fully owned path: the reviewer as a bespoke agent on a managed runtime with durable sessions and memory, wired to webhook events from the source host. The right answer when the reviewer must hold context across a multi-change refactor, decompose "audit this service for compliance drift" into a hundred sub-tasks via a planner-and-sub-agents pattern, or coordinate with other agents. The trade: you own evaluation, observability, cost, and the on-call rotation when it fails in production.

Three questions tell you which tier you need:

1. **How specific is the review criteria?** Generic → Tier 1. Team- or repo-specific → Tier 2 or 3.
2. **Does the agent need to remember things across runs?** No → Tier 1 or 2. Yes (codebase memory, cross-change context) → Tier 3.
3. **What is the worst case if it goes wrong?** A noisy comment → any tier. A merged regression or leaked secret → Tier 3 with a policy gate in front of every tool call.

Most teams discover their tier the moment the managed reviewer misses something specific. A platform team at a mid-size fintech, for example, started on Tier 1 and found their compliance reviewer flagging boilerplate auditors had already signed off — while missing the one pattern that mattered, unmasked credentials in log statements. A 40-line compliance skill wired to a CI action (Tier 2) dropped the false positives sharply within a week. Tier 3 has not yet been needed.

Tier 3 at full scale means graph-native code understanding. Loading code as flat text into a context window runs out of room on hundred-million-line codebases, and standard retrieval strips out the structure that makes code legible: a class belongs to a file, a call traces to a requirements doc written a decade ago. Flatten that into a vector store and the map is gone.

![Custom code review runtime: knowledge graph plus code context feeding a Search → Impact → Tasks → Coding sub-agent pipeline](/uploads/87c3ca9b-f06d-4874-90dc-92d2b9391203.png)

The pattern that has emerged on the largest legacy modernisations is to build the agent on a knowledge graph. Ingest code, docs, tickets, and design documents into a graph database, then combine three retrieval modes: graph traversal for structural queries ("every function that transitively calls payment processing"), vector search over node embeddings for semantic queries ("find code that does what this paragraph describes"), and full-text search for exact identifier matches. The combination answers "what breaks if I change this?" with a precise impact map instead of a confident guess.

The second half is decomposition. A single agent told to "refactor this module" will fail. Split the same job across a sub-agent pipeline — a Search agent that explores the graph, a Story agent that captures requirements, an Impact agent that predicts side-effects, a Task-breakdown agent that produces atomic units of work, and only then a Coding agent — and the work becomes manageable. Pilots in production on million-line codebases have moved equivalent refactor work from two weeks to a few hours. This is Tier 3 at full scale: not an agent that watches changes, but one that understands the system the changes live in.

A managed runtime gets you a generic reviewer in minutes. A hybrid runtime gets you your reviewer in a day. A custom runtime gets you a reviewer that understands the whole system — at the cost of owning the runtime and the evaluation. Pick the lowest tier that catches what matters.

Local mapping: Tier 2 is the sensor sidecar plus a review skill, triggered on schedule; Tier 1 judgment applies wherever traffic never justifies custom tooling; Tier 3 stays a horizon item behind the graph-worthiness gate. The review skill template lives in the Code Reviews mod; the machine gate in front of risky tool calls lives in the Policy gate mod, its human half in high-stakes confirmation.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['continuous-reviewer', 'tiers', 'ci', 'knowledge-graph', 'decomposition'],
    links: [
      { label: 'Day-5 paper', url: 'https://www.kaggle.com/whitepaper-spec-driven-production-grade-development-in-the-age-of-vibe-coding' },
    ],
  },
  {
    title: 'Sustainability',
    category: 'Workflow',
    summary: 'Day-5 section, quoted: approval fatigue burns out frequent AI users — replace constant oversight with structured boundaries.',
    body: `A new phenomenon: approval fatigue. Research reports frequent AI users are 45% more likely to experience high burnout than non-users. Faced with a constant stream of micro-approvals — improving a single line, adjusting a tool call — developers start clicking "Approve" reflexively. It is a low-grade exhaustion where the team stops checking the machine's work just to keep up with its pace, and attention to detail goes missing.

To protect the team, move from constant oversight to structured boundaries:

- **Digital quiet hours.** Set boundaries so approval requests do not bleed into evenings and weekends.
- **Agent insight sessions.** Hold weekly sessions where developers share patterns identified by their AI counterparts, turning isolated discoveries into shared organizational knowledge.

Local mapping: fatigue is the failure mode the high-stakes confirmation mod reserves ceremony for the irreversible to avoid; micro-approvals are the unit the steering loop should count before they train disregard like a noisy sensor; insight sessions are the decisions journal kept as a conversation — discoveries encoded into guides before they evaporate. Oversight scales through gates, not vigilance.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['sustainability', 'fatigue', 'burnout', 'boundaries', 'culture'],
    links: [
      { label: 'Day-5 paper', url: 'https://www.kaggle.com/whitepaper-spec-driven-production-grade-development-in-the-age-of-vibe-coding' },
    ],
  },
  {
    title: 'Policy gate',
    category: 'Tooling',
    summary: 'Day-5 pattern: a two-layer machine gate in front of every tool call — structural YAML rules plus a semantic referee — so violations self-correct before executing.',
    body: `System-prompt rules are brittle: contexts overflow and agents can be talked past their instructions. Production governance therefore lives outside the model, in a policy gate that intercepts every tool call before it executes. Execution logic and governance logic stay separated — a critical separation of concerns.

Two layers, in order:

1. **Structural gating (traffic lights).** Deterministic, binary, fast: roles and environments mapped to allowed and blocked tools in a plain config file (a viewer role cannot send mail; a local environment cannot touch production senders). Architectural violations die here without spending model judgment.
2. **Semantic gating (intelligent referee).** A secondary model inspects the intent and arguments of each proposed action against natural-language guidelines — the cases structure cannot reach. A role may be allowed to send mail yet forbidden from sending unmasked personal data; no allowlist or regex enumerates every leak shape, but a referee reading the actual arguments catches them.

The interception flow: structural check first (is this tool allowed for this role and environment?), semantic check second (are these arguments safe?), execution only if both pass. Otherwise the gate returns a policy-violation message to the agent, which self-corrects or fails gracefully — governance as feedback, not just a wall.

Local mapping: the structural half is dependency rules applied to tool calls (layer direction, deny by default); the semantic half is the review step moved before execution; the violation message is an agent-actionable error by construction. High-stakes confirmation remains the human half of the same gate — machine referee first, human meaning-check last.`,
    considered: true,
    implemented: false,
    wanted: true,
    tags: ['policy', 'gating', 'tools', 'governance', 'self-correction'],
    links: [
      { label: 'Day-5 paper', url: 'https://www.kaggle.com/whitepaper-spec-driven-production-grade-development-in-the-age-of-vibe-coding' },
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