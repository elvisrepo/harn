---
name: to-tickets
description: Break a spec, plan, or the current conversation into tracer-bullet vertical-slice tickets with blocking edges, written as markdown files at docs/tickets/.
disable-model-invocation: true
---

# To Tickets

Break the spec (or plan) into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it. Each ticket becomes one file at `docs/tickets/NN-<slug>.md`.

## Ticket file format

```markdown
---
id: 4
title: <short imperative title>
blocks: [2]          # ticket ids that must complete before this one can start
slice: <schema → api → ui → tests>
status: todo         # todo | active | done
---

# <Title>

- One paragraph of scope: what this slice makes true, end to end.
- Acceptance: how this slice is demoable/verifiable on its own.
- Test seam: where it plugs in (from the spec).
```

## Vertical slice rules

- Each slice cuts a **narrow but COMPLETE path through every layer** (schema, API, UI, tests) — vertical, NOT a horizontal slice of one layer.
- A completed slice is **demoable or verifiable on its own**.
- Each slice is **sized to fit in a single fresh context window** — if it won't, split it.
- Any **prefactoring** ("make the change easy, then make the easy change") comes first as its own ticket or step.

**Wide refactors are the exception to vertical slicing.** A wide refactor (rename a column, retype a shared symbol) whose blast radius fans across the whole codebase can't land green in any single slice. Sequence it as **expand–contract**: expand (new form beside old, nothing breaks) → migrate in batches by blast radius (each batch = a ticket blocked by the expand, CI stays green) → contract (delete the old form once no caller remains, blocked by every migrate batch).

## Process

1. Gather context: read the spec (or use the conversation). If a path/URL was passed, read it.
2. Draft the tickets with their blocking edges. Derive order from the blocks (topological).
3. **Present the breakdown to the user** as a numbered list: title + one-line scope + its blockers, any wide refactor flagged separately. Get explicit adjustments/confirmation.
4. Write the ticket files with sequential ids (01, 02, …). Done.

The natural next step is `/skill:implement` on the first unblocked ticket.