---
name: grilling
description: Interview the user relentlessly about a plan, decision, idea, or feature until you reach a shared understanding. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases ("grill me", "pressure-test this", "is this plan sound").
---

# Grilling

Interview the user relentlessly until you reach a shared understanding. Map the topic as a **design tree**: every decision branches into the decisions that hang off it.

## Rounds

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format each round like so:

```
❓ **Q1** - **<question title>**: <question body, may be multiple paragraphs, may include explicit choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body>

➡️ <your recommended answer>
```

Each round's answers reshape the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

## Facts are your job, never the user's

When a frontier question needs a fact (filesystem, current repo state, library versions, services, pricing, precedents), find it yourself:
- Use `read`/`bash` to inspect the repo.
- Use the **`firecrawl`** skill family (Firecrawl CLI: `search` / `scrape` / `crawl`) for web facts and OSS precedents.

Never ask the user for anything you could look up. Don't block on research: an exploration in flight is an unsettled prerequisite, so only the questions downstream of it wait; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

## Coverage — breadth depends on the topic

- **New project (greenfield, fullstack)** — seed the design tree from the **fullstack coverage list** below: all 14 areas get visited.
- **New feature (existing app)** — seed from only the applicable subset: requirements, API/schema/database impact, integration/notification impact, non-functional requirements, edge cases + failure modes, testing seams, migration/release. Do not re-litigate the whole platform; note that scope explicitly.
- **Small plan/decision** — no explicit seeding; grow the tree from what the user presents.

### Fullstack coverage list (greenfield)

1. **Planning & Requirements** — problem, audience, value; user stories; NFRs; core entities; MVP vs nice-to-have; API design; data flow; high-level design; deep dives (edge cases, bottlenecks, **concurrency + failure modes**); ERD; wireframes/mockups; tech stack; success metrics/KPIs.
2. **Architecture & Design** — monolith vs services (tradeoffs); DB schema & relationships; API contracts; authentication/authorization; scalability & security (OWASP).
3. **Risks, constraints & compliance** — legal/regulatory exposure, PII/data protection, budget ceiling, timeline, skill constraints.
4. **External integrations & notifications** — 3rd-party APIs, webhooks, transactional email/SMS, downstream failure handling.
5. **Data lifecycle** — retention window, archival, erasure/deletion flows.
6. **Dev environment** — git + CI, Docker Compose for local deps, project structure, linters/formatters/pre-commit, env vars, secrets strategy.
7. **Backend** — framework, models & migrations, CRUD endpoints, auth, validation & error handling, business logic, API docs.
8. **Frontend** — framework, reusable components, routing, API wiring, state management, responsive + accessibility.
9. **Testing** — unit/integration/e2e/performance — plus the **seam strategy** (one highest seam, agreed before tickets).
10. **Infra & DevOps** — IaC, CI/CD, orchestration, secrets mgmt, backup/DR, CI security (SAST, secret scanning, dependency updates).
11. **Production deployment** — hosting, managed DB, domain/SSL, env config, CDN, prod migrations, rate limiting/DDoS.
12. **Monitoring & maintenance** — logging, error tracking, uptime, analytics, SLIs/SLOs + alerting thresholds.
13. **Release strategy & environments** — dev/staging/prod parity, expand–contract migrations, rollback path, feature flags.
14. **Post-launch** — feedback, metrics, bug iteration, roadmap, scaling; demo/seed data + walking-skeleton evaluation.

## Done

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Summarize the settled tree. Do not act on it until the user confirms you have reached a shared understanding. The natural next step is `/skill:to-spec`.