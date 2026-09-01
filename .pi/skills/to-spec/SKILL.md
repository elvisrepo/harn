---
name: to-spec
description: Turn the current conversation (typically a completed grilling session) into a written spec at docs/specs/. No interview, just synthesis of what was already discussed.
disable-model-invocation: true
---

# To Spec

Synthesize the settled decisions from the current conversation into a spec file at `docs/specs/<slug>.md`. **Do NOT interview the user** — just synthesize what you already know.

## Process

1. If you have not already explored the repo, do so to understand the current state of the codebase. Use the domain vocabulary already established; respect any ADRs in the area you're touching.
2. **Design the test seam(s)** at which the feature will be tested:
   - Prefer existing seams over new ones.
   - Use the **highest seam possible** — the boundary closest to user-visible behavior that still supports reliable tests.
   - The ideal number is one; the fewer seams, the better.
   - If new seams are needed, propose them and check with the user that they match expectations.
3. Write the spec using the template below. Only include what was actually decided (in grilling or the conversation). If something important was never decided, either derive it from an explicit decision or list it under **Open Questions** — do not invent decisions.

## Template

```markdown
# <Feature> — Spec

## Problem Statement
The problem the user is facing, from the user's perspective.

## Solution
The solution, from the user's perspective.

## User Stories
1. As an <actor>, I want a <feature>, so that <benefit>
2. ...(extensive, numbered; cover all aspects of the feature)

## Implementation Decisions
- What was decided in grilling, including explicitly deferred items (and why).

## Test Seam
The single highest seam at which this feature is tested, and how test doubles plug in.

## Open Questions
- Anything never settled — keep this list short.
```

## Output

Write the file to `docs/specs/<slug>.md` (slug from the feature name, kebab-case). Do not commit — implementation owns commits. The natural next step is `/skill:to-tickets`.