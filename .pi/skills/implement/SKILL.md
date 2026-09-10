---
name: implement
description: Implement one ticket (or the first unblocked ticket) from docs/tickets/ against its spec. TDD at the spec's test seam.
disable-model-invocation: true
---

# Implement

Implement work described by a ticket from `docs/tickets/` and its spec in `docs/specs/`.

## Process per ticket

1. Identify the ticket to work on: the one the user names, or (if asked to proceed) the lowest-id **unblocked** ticket — all its `blocks` must be done.
2. Read the spec: the **Test Seam** section tells you where tests plug in.
3. **Write the test first** at that seam (TDD), run it, watch it fail for the right reason.
4. Implement until the test goes green. Run typechecking regularly and single test files regularly; run the full test suite once at the end.
5. Respect the ticket's scope. If the work turns out bigger than the ticket says (scope creep appears), **stop and tell the user** — do not silently expand the slice.
6. Self-review the diff before committing (read it as a skeptical reviewer, not its author). Check each item, then commit to the current branch with the ticket id in the message: `ticket 4: <title>`.
   - **Minimalism**: every hunk serves the ticket — no speculative extras, no drive-by refactors.
   - **Scope**: nothing outside the ticket's slice (see step 5).
   - **CfRs**: secrets only via env (nothing logged/echoed); snapshots stay point-in-time truth; behaviour verified in real conditions, not just dev.
   - **Catalog mirror**: any catalog-visible change is mirrored into `scripts/seed.ts`.
   - **Receipts**: `npm run check` green with the failure evidence fed back, not summarized away.

The next unblocked ticket starts only when the user says continue.