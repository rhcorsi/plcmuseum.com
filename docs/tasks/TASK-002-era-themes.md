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
- One file per era in `src/styles/themes/{1970s,1980s,1990s,2000s,2020s}.css`. Each already exists as a skeleton: one `html[data-era="<era>"] {}` block with the list of tokens to override and the rules in its header comment. Override only tokens listed in `docs/DESIGN_SYSTEM.md` section 1, except the stage geometry (`--stage-*`), which stays the museum's in every era so the stage never moves again when Era UI switches the era; declare only values that change something (a restated museum value freezes it against later `tokens.css` changes). Optional decorative layers go under `html[data-era="<era>"] body::before`, guarded by `@media (prefers-reduced-motion: no-preference) and (prefers-contrast: no-preference)`, and stay behind the content (`position: fixed` and a negative `z-index`): never over exhibit images or text. (Rules added at review, 2026-10-15.)
- The theme files are imported unlayered by `src/styles/global.css` while `tokens.css` sits in `@layer tokens`, so an era value beats the museum value in both color schemes without a specificity fight.
- Both color schemes: light values in the `html[data-era="<era>"]` block; dark values, identical, in `@media (prefers-color-scheme: dark) { html[data-era="<era>"]:not([data-theme="light"]) {} }` and `html[data-era="<era>"][data-theme="dark"] {}` (the pattern in `tokens.css`). Colors as `#rrggbb` so the contrast test can read them.
- Motion tokens (`--motion-*`) never go in a theme file: era-specific motion goes in `src/styles/motion.css` under `html[data-era="<era>"]`, before its final reduced-motion block, which must keep winning.
- `tests/styles/tokens.test.ts` enforces all of this mechanically: one light block per theme, only its own era's selectors, only contract tokens (no motion, no stage geometry), no restated museum values, decoration behind the content, identical dark blocks, hex colors, the WCAG contrast floor of `tokens.css` (body text 7:1, secondary text and links 4.5:1, focus and state colors 3:1), and state colors that keep their meaning: `--color-accent`, `--color-focus` and `--color-text` at least 10 CIEDE2000 from each `--color-state-*` (below about 5 two colors read as one), for every era in light and dark.
- CSP: no `url()` to anything outside the site, no `@import`, no inline styles anywhere.
- Fonts: propose at most one open-licensed font per era in "Design notes", with a link to its license or marked "license unverified"; do not add font files in this task (Claude Code adds them after license check). Use `--font-display` fallbacks meanwhile.

## Fixtures
`src/pages/dev/tokens.astro` (renders every token swatch, type scale, buttons, a spec grid and a stage mock) with the `?era=` and `?theme=light|dark` switch. Astro strips the query string from prerendered pages, also under `astro dev`, so the switch is applied in the browser after load (`src/components/dev/FixtureSwitches.astro`).

## Allowed paths
`src/styles/themes/*.css`, `src/styles/motion.css` (era-specific motion variables only), `docs/tasks/TASK-002-era-themes.md` (Design notes section).

## Out of scope
`tokens.css` (museum theme), components, islands, illustrations (TASK-003), fonts files, any JS. The 1980s tagline cursor blink is component behavior and belongs to a later stage task, not to a theme file.

## Requirements
- Accessibility: contrast AA for text and AAA for body text where feasible, in every era, light and dark; focus ring visible on every background.
- Reduced motion and contrast: decorative overlays (scanlines, bevel noise) disappear under the media queries; no flicker effects.
- Performance: no images larger than 4 KB in overlays (prefer CSS gradients), no additional network requests.
- Trademarks: no reproduction of Windows, macOS or vendor UI assets; "inspired by" through shape, color and type only.
- Notes describe intent ("inspired by ISA-101 high-performance HMI guidance"), not compliance or technical fact without a source.

## Acceptance criteria
- [ ] Five theme files; fixture page screenshots at 390 px and 1280 px, light and dark, per era (20 images), attached to the PR, not committed.
- [ ] `pnpm test` green: `tests/styles/tokens.test.ts` checks the contrast pairs of every era in light and dark (no axe or Pa11y: they would be new dependencies; ask the owner in Questions if you want one).
- [ ] Color, shadow and radius overrides cause no reflow. Font, text-size, spacing and border-width overrides (for example the 1980s monospace) may reflow on an era switch, but nothing overflows at 390 px and no font loads late; the per-era screenshots show the result.
- [ ] The 1970s 7-segment year goes through `--font-numeric` (the token the year watermark reads), with a system or already-licensed fallback until a font file is approved.
- [ ] `pnpm lint && pnpm build` green.

## Verification steps
`pnpm dev` → `/dev/tokens?era=1990s&theme=dark`; toggle `prefers-reduced-motion`, `prefers-contrast` and `prefers-color-scheme` in DevTools; `pnpm test`; for screenshots, wait for `html[data-era="<era>"]` before capturing (the switch runs after load).

## Questions (implementer → architect)

## Design notes (implementer)

## Review (Claude Code)
