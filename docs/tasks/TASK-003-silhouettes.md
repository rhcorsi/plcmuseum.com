status: ready
id: TASK-003
title: Original silhouette illustrations for exhibits without licensed photos
assignee: gemini
branch: feat/task-003-silhouettes
depends_on: []
created: 2026-10-14

## Goal
Every exhibit can ship before a licensed photo exists. A set of original, neutral line illustrations represents hardware categories on the stage and on share cards, labeled "illustration" in the UI, with no brand marks.

## Contract
- Files: `src/assets/illustrations/<name>.svg`, viewBox 640×260, strokes in `currentColor`, no embedded fonts, no raster, each <= 12 KB, with `<title>` and `role="img"`.
- Names (first batch): `rack-modular`, `rack-dcs-cabinet`, `compact-plc`, `micro-plc`, `cpu-module`, `programming-terminal-crt`, `programming-case`, `operator-console-crt`, `multiloop-controller`, `io-remote-rack`.
- Each file gets a sidecar `<name>.meta.json` using `content/schema/image-meta.schema.json` with `license: original-illustration`.

## Fixtures
`src/pages/dev/illustrations.astro` renders every SVG at 160 px and 640 px in the default theme and per era.

## Allowed paths
`src/assets/illustrations/**`, `src/pages/dev/illustrations.astro`, this task file (Design notes).

## Out of scope
Photos, logos, product-specific label artwork, animation, island code.

## Requirements
- Accessibility: meaningful `<title>`; decorative details hidden with `aria-hidden`.
- Trademarks: generic shapes only; a recognizable form factor is fine, a brand mark, wordmark or label layout is not.
- Era themes: must read well with the color tokens of every era (stroke only, no fills that assume a background).
- Performance: total batch <= 80 KB.

## Acceptance criteria
- [ ] Ten SVGs plus meta files; fixture page screenshots at 390 px and 1280 px.
- [ ] `pnpm validate:content` has no image errors; `pnpm lint && pnpm build` green.
- [ ] Reviewer confirms no brand marks.

## Verification steps
`pnpm dev` → `/dev/illustrations?era=1970s`; inspect SVG sources for fonts or raster; run validator.

## Questions (implementer → architect)

## Design notes (implementer)

## Review (Claude Code)
