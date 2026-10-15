status: ready
id: TASK-002
title: Five era themes over the token contract
assignee: gemini
branch: feat/task-002-era-themes
depends_on: []
created: 2026-10-14

## Goal
With Era UI on, the whole site changes skin by decade: 1970s painted metal panel, 1980s phosphor CRT, 1990s gray bevelled dialogs, 2000s dark glossy metal, 2020s ISA-101 high-performance HMI. Switching is instantaneous (tokens only) and never breaks readability, contrast or layout.

## Contract
- One file per era in `src/styles/themes/{1970s,1980s,1990s,2000s,2020s}.css`, each a single `html[data-era="<era>"] { ... }` block overriding only tokens listed in `docs/DESIGN_SYSTEM.md` section 1, plus optional decorative layers under `html[data-era="<era>"] body::before` guarded by `@media (prefers-reduced-motion: no-preference) and (prefers-contrast: no-preference)`.
- Both color schemes: define light and dark values (`:root[data-theme="dark"]` and the media query pattern used in `tokens.css`).
- Fonts: propose at most one open-licensed display font per era in "Design notes"; do not add font files in this task (Claude Code adds them after license check). Use `--font-display` fallbacks meanwhile.

## Fixtures
`src/pages/dev/tokens.astro` (renders every token swatch, type scale, buttons, a spec grid and a stage mock) with `?era=` switch.

## Allowed paths
`src/styles/themes/*.css`, `src/styles/motion.css` (era-specific motion variables only), `docs/tasks/TASK-002-era-themes.md` (Design notes section).

## Out of scope
`tokens.css` (museum theme), components, islands, illustrations (TASK-003), fonts files, any JS.

## Requirements
- Accessibility: contrast AA for text and AAA for body text where feasible, in every era, light and dark; focus ring visible on every background.
- Reduced motion and contrast: decorative overlays (scanlines, bevel noise) disappear under the media queries; no flicker effects.
- Performance: no images larger than 4 KB in overlays (prefer CSS gradients), no additional network requests.
- Trademarks: no reproduction of Windows, macOS or vendor UI assets; "inspired by" through shape, color and type only.

## Acceptance criteria
- [ ] Five theme files; fixture page screenshots at 390 px and 1280 px, light and dark, per era (20 images).
- [ ] Contrast report (axe or Pa11y output) attached in Design notes.
- [ ] Switching era on the fixture page causes no layout shift (CLS 0) because only paint changes.
- [ ] `pnpm lint && pnpm build` green.

## Verification steps
`pnpm dev` → `/dev/tokens?era=1990s`; toggle `prefers-reduced-motion` and `prefers-color-scheme` in DevTools; run `pnpm test:e2e --grep tokens`.

## Questions (implementer → architect)

## Design notes (implementer)

## Review (Claude Code)
