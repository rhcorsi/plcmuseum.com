status: in_review
id: TASK-002
title: Five era themes over the token contract
assignee: gemini
branch: feat/task-002-era-themes
depends_on: []
created: 2026-10-14

## Goal
With Era UI on, the whole site changes skin by decade: 1970s painted metal panel, 1980s phosphor CRT, 1990s gray bevelled dialogs, 2000s dark glossy metal, 2020s ISA-101 high-performance HMI. Switching is instantaneous (tokens only) and never breaks readability, contrast or layout.

## Contract
- One file per era in `src/styles/themes/{1970s,1980s,1990s,2000s,2020s}.css`. Each already exists as a skeleton: one `html[data-era="<era>"] {}` block with the list of tokens to override and the rules in its header comment. Where the skeleton header and this contract differ, this contract wins: the header still lists `--stage-*` among the tokens to override and predates the rules below, so update your own header to match. Override only tokens listed in `docs/DESIGN_SYSTEM.md` section 1, except the stage geometry (`--stage-*`), which stays the museum's in every era so the stage never moves again when Era UI switches the era; declare only values that change something (a restated museum value freezes it against later `tokens.css` changes). Optional decorative layers go under `html[data-era="<era>"] body::before`, guarded by `@media (prefers-reduced-motion: no-preference) and (prefers-contrast: no-preference)`, and stay behind the content (`position: fixed` and a negative `z-index`): never over exhibit images or text. They therefore show as page-background texture between components, not as a screen-wide overlay; `html` is the only element that paints the page background. (Rules added at review, 2026-10-15.)
- The theme files are imported unlayered by `src/styles/global.css` while `tokens.css` sits in `@layer tokens`, so an era value beats the museum value in both color schemes without a specificity fight.
- Both color schemes: light values in the `html[data-era="<era>"]` block; dark values (only where they differ from the era's own light values), identical, in `@media (prefers-color-scheme: dark) { html[data-era="<era>"]:not([data-theme="light"]) {} }` and `html[data-era="<era>"][data-theme="dark"] {}` (the pattern in `tokens.css`). Colors as `#rrggbb` so the contrast test can read them.
- Motion tokens (`--motion-*`) never go in a theme file: era-specific motion goes in `src/styles/motion.css` under `html[data-era="<era>"]`, before its final reduced-motion block, which must keep winning.
- `tests/styles/tokens.test.ts` enforces all of this mechanically: one light block per theme, only its own era's selectors, only contract tokens (no motion, no stage geometry), no restated museum values, decoration behind the content, identical dark blocks, hex colors, the WCAG contrast floor of `tokens.css` (body text 7:1, secondary text and links 4.5:1, focus and state colors 3:1), and state colors that keep their meaning: `--color-accent`, `--color-focus` and `--color-text` at least 10 CIEDE2000 from each `--color-state-*` (a design floor: around 5 a difference is still visible side by side, but too small to carry meaning), for every era in light and dark.
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

- **1970s (`src/styles/themes/1970s.css`)**: Warm enameled sheet-metal putty (`#e6e2d8` to `#f7f4ec`) in light mode and dark crinkle-finish enclosure charcoal (`#141513` to `#232622`) in dark mode, with thick `2px` borders, sharp corners (`0rem` to `0.1875rem`), stamped plate shadows, and a subtle (`3%` alpha) `repeating-linear-gradient` brushed-panel grain on `body::before` placed behind the content (`position: fixed; z-index: -1`). The crimson/ruby LED accent (`#820f1e` light, `#ff4d6d` dark) and sky/cobalt focus ring (`#0b57a4` light, `#66b8ff` dark) stay at least 10 CIEDE2000 away from every `--color-state-*` token. `--font-numeric` uses the 7-segment fallback stack (`'DSEG7 Classic', 'Cascadia Mono', 'Consolas', 'Courier New', ui-monospace, monospace`), and `--font-mono` starts with `ui-monospace, 'Cascadia Mono', 'SFMono-Regular', Consolas` so small labels stay crisp.
- **1980s (`src/styles/themes/1980s.css`)**: Monospace everywhere (`--font-display`, `--font-body`, and `--font-numeric` alias `var(--font-mono)`), `0rem` border radius, and `none` for all shadow tokens (declared once in the light block so dark inherits them without duplication). Dark mode is inspired by P31 green phosphor CRTs (`#80ff9f` text on `#050c07` glass with P3 amber `#ff9914` accents and cyan `#5ce1ff` focus, with `--color-state-ok: #20d6c7` and `--color-state-warn: #ffe047` separated by more than 10 CIEDE2000 from text and accent); light mode models a daylight reverse-video green-tinted terminal (`#081c0e` text on `#e3efe5` with deep teal `#00594c` accent and cobalt `#004d99` focus). A subtle `4px` horizontal scanline `repeating-linear-gradient` sits behind the content (`position: fixed; z-index: -1`) under the reduced-motion and contrast guards, and `src/styles/motion.css` sets discrete character-cell easing (`steps(4, end)` for UI, `steps(8, end)` for stage).
- **1990s (`src/styles/themes/1990s.css`)**: Workstation dialog pewter gray (`#d4d0c8` and `#ece9d8`, with a distinct `#c2bdb2` hover step) and active-titlebar navy (`#002b80`) in light mode, and dark SCADA slate (`#181a1f` and `#282c34`) with sky-blue (`#7ab0ff`) and yellow focus (`#ffd147`) in dark mode. Zero border radius (`0rem`) and multi-layered `inset` highlight/shadow bevels on `--shadow-sm`, `--shadow-md`, and `--shadow-stage` reproduce 3D raised panels without proprietary assets or overlays.
- **2000s (`src/styles/themes/2000s.css`)**: Brushed anodized aluminum (`#dce3ec` to `#f4f7fb`) with cobalt (`#0050a8`) in light mode, and high-contrast gunmetal (`#0d121a` to `#1b2536`) with electric cyan (`#4db8ff`) in dark mode. Medium radii (`0.375rem` to `1.125rem`) and specular top-edge `inset` highlights in the shadow tokens give depth without an overlay over exhibit imagery.
- **2020s (`src/styles/themes/2020s.css`)**: Inspired by ISA-101 high-performance HMI guidance: all 11 non-state color tokens (`bg`, `bg-elevated`, `surface`, `surface-hover`, `text`, `text-muted`, `text-inverse`, `accent`, `accent-contrast`, `border`, `focus`) are achromatic neutral grays (`R = G = B` in both light `#e2e2e2` and dark `#171717` schemes), reserving chromatic color for `--color-state-ok`, `--color-state-warn`, and `--color-state-alarm`, paired with flat depth (`none` shadows) and small radii (`0.125rem` to `0.375rem`).
- **Proposed open-licensed fonts (one per era, for future license check)**:
  - **1970s**: `DSEG7 Classic` for `--font-numeric` (SIL OFL 1.1: https://github.com/keshikan/DSEG/blob/master/DSEG-LICENSE.txt).
  - **1980s**: `IBM Plex Mono` for `--font-display` and `--font-mono` (SIL OFL 1.1: https://github.com/IBM/plex/blob/master/LICENSE.txt).
  - **1990s**: `Arimo` for `--font-display` (SIL OFL 1.1: https://github.com/googlefonts/arimo/blob/main/OFL.txt).
  - **2000s**: `Barlow Condensed` for `--font-display` (SIL OFL 1.1: https://github.com/jpt/barlow/blob/main/OFL.txt).
  - **2020s**: `Inter` for `--font-display` (SIL OFL 1.1: https://github.com/rsms/inter/blob/master/LICENSE.txt).
- **Verification**: Verified all 103 tests in `tests/styles/tokens.test.ts` (including `--color-focus` on `--color-bg-elevated`, CIEDE2000 state distance >= 10, no restated museum tokens, no `--stage-*` overrides, and negative `z-index` on `body::before`), ran the Playwright 320 px text-spacing column check across every language and era, recaptured the 20 `/dev/tokens` screenshots (`390 px` and `1280 px`, `light` and `dark`, per era), and ran `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Review (Claude Code)
