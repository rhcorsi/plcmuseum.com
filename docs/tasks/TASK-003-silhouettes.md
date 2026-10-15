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
- Files: `src/assets/illustrations/<name>.svg`, root `<svg id="art" viewBox="0 0 640 260">`, strokes in `currentColor`, no embedded fonts, no raster, each <= 12 KB, with `<title>` and `role="img"`.
- Pages and islands render an illustration as `<svg viewBox="0 0 640 260" role="img" aria-label="..."><use href="<file url>#art" /></svg>` (see `ExhibitCard.silhouette` in `src/islands/contracts.ts`), so the root `id="art"` is required and the strokes inherit the era colors through `currentColor`. Never inline the markup.
- Exhibits without an illustration of their own get one of these automatically: `src/lib/exhibit-card.ts` maps category and architecture to a name (`GENERIC_ILLUSTRATION_BY_CATEGORY`, `GENERIC_ILLUSTRATION_BY_ARCHITECTURE`), so a file appears on the stage as soon as it exists under that exact name.
- Names (first batch): `rack-modular`, `rack-dcs-cabinet`, `compact-plc`, `micro-plc`, `cpu-module`, `programming-terminal-crt`, `programming-case`, `operator-console-crt`, `multiloop-controller`, `io-remote-rack`.
- Each file gets a sidecar `<name>.meta.json` using `content/schema/image-meta.schema.json` with `"file": "src/assets/illustrations/<name>.svg"` and `license: original-illustration` (the schema accepts this directory since Phase 0).
- `pnpm validate:content` enforces, for every file in this directory: SVG only, a sidecar whose `file` matches, `original-illustration` license, root `id="art"` and `viewBox="0 0 640 260"`, and SVG safety (no `<script>`, `<foreignObject>`, `<image>`, `on*` handlers, `javascript:`, `<!ENTITY>`, href animations, external `url()` or `@import`; every `href` starts with `#`). Plain SVG only: elements from the allowlist in `scripts/validate-content.mjs` (svg, g, path, rect, circle, ellipse, line, polyline, polygon, text, tspan, title, desc, defs, use, symbol, linearGradient, radialGradient, stop, clipPath, mask, pattern, style, metadata), only the SVG and XLink namespaces (editor exports such as Inkscape or sodipodi attributes must be cleaned), no named or numeric character references beyond the five XML ones, no backslashes, no @import or image-set(), no src/action/data attributes. The checks read the raw text, comments included.

## Fixtures
`src/pages/dev/illustrations.astro` renders every SVG at 160 px and 640 px in the default theme and per era. Reuse `src/components/dev/FixtureSwitches.astro` (as `src/pages/dev/coverflow.astro` does) for `?era=` and `?theme=`, and get the file URLs with `import.meta.glob('/src/assets/illustrations/*.svg', { query: '?url', import: 'default', eager: true })`, rendered through `<use href="...#art">` so the page proves the theming works.

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
