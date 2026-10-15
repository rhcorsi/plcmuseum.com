status: draft | ready | in_progress | in_review | done | blocked
id: TASK-000
title: <short title>
assignee: codex | gemini | claude-code | owner
branch: feat/task-000-<slug>
depends_on: []
created: YYYY-MM-DD

## Goal
One paragraph: what the user sees or gets when this is done.

## Contract
Types, props, events, CSS hooks or data this task must conform to. Link to `src/islands/contracts.ts`, `src/content/types.ts`, `docs/DESIGN_SYSTEM.md` sections.

## Fixtures
Which files in `src/fixtures/` to code against. Never real content.

## Allowed paths
Exact globs this task may create or modify. Anything else is out of scope.

## Out of scope
Explicit list, to prevent helpful drift.

## Requirements
- Accessibility: ...
- Reduced motion: ...
- Performance budget: ...
- Era themes affected: ...
- i18n: all copy from `src/i18n`, keys listed here: ...

## Acceptance criteria
- [ ] testable statement
- [ ] testable statement

## Verification steps
Commands and manual checks the reviewer will run (`pnpm test`, `pnpm test:e2e`, fixture page URL, screenshots).

## Questions (implementer → architect)
(empty until needed)

## Implementation notes / Design notes (implementer)
(appended at handback)

## Review (Claude Code)
(filled at review)
