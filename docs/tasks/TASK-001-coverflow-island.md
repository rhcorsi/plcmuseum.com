status: ready
id: TASK-001
title: CoverFlow stage island (React)
assignee: codex
branch: feat/task-001-coverflow
depends_on: []
created: 2026-10-14

## Goal
The home page shows a horizontal 3D stage of exhibits: the centered exhibit is large and frontal, neighbors recede with perspective on both sides, a giant year watermark sits behind the centered item. Visitors move with arrow keys, swipe, trackpad scroll, or by clicking a side item. Changing the centered item updates the header (name, year, tagline) and emits an event that the page uses to switch the Era UI theme when the toggle is on.

## Contract
- Component: `src/islands/CoverFlow.tsx`, default export.
- Props and data: `CoverFlowProps` and `ExhibitCard` in `src/islands/contracts.ts` (the source of truth; read its comments). Summary:
  ```ts
  export type ExhibitImage = { src: string; srcset: string; width: number; height: number; credit: string };
  export type ExhibitCard = {
    id: string; slug: string; href: string; name: string; manufacturer: string;
    year: number;        // digits only: the decorative, aria-hidden watermark
    yearPrecision: 'exact' | 'approximate' | 'disputed';
    yearLabel: string;   // "1986" or "approx. 1986", localized: every readable year
    decade: Decade; era: EraTheme; tagline: string; textLang: Lang; alt: string;
    image: ExhibitImage | null;  // licensed photo; width/height reserve the aspect ratio; show credit next to it
    silhouette: string | null;   // "<url>#art": render <svg viewBox="0 0 640 260"><use href={silhouette} /></svg>
  };
  export type CoverFlowProps = {
    exhibits: ExhibitCard[]; listId: string; initialId: string; lang: Lang; eraUiEnabled: boolean;
    labels: { prev: string; next: string; open: string };
    onCenterChange?: (id: string) => void;
  };
  ```
  Changes from the first draft of this task (2026-10-14, before anyone started): `href`, `manufacturer`, `yearPrecision`, `yearLabel`, `era` and `textLang` added; `alt` moved from `image` to the card (it describes the photo or the illustration); `image` carries `width`, `height` and the license `credit`; `silhouette` is a `<use>` reference so the strokes follow the theme tokens; `listId` and `labels` added to the props. The year watermark is decorative, `aria-hidden` and digits only (`year`, docs/I18N.md); every readable year uses `yearLabel`, never a bare `year` (approximate and disputed years carry "approx.").
- How the island attaches: it does not render a second list. It mounts next to the server-rendered `<ol id={listId} class="stage-list">` of `src/components/StageList.astro` (hooks in `STAGE_HOOKS`), renders only its own controls and the live region, and drives the existing items through classes, ARIA attributes and CSS custom properties set with `element.style.setProperty()`. `exhibits` is the same data, for lookups and announcements. Without JS, and under reduced motion, the list stays exactly as StageList renders it. The fixture page keeps exactly 12 `.stage-list .stage-item`. StageList's styles are Astro-scoped (specificity 0,2,0 on `.stage-list`): change them in StageList itself (it is in the allowed paths) rather than fighting them from `coverflow.css`; keep its markup, ids and data attributes (one exception, approved by the owner on 2026-10-15: the aria-hidden `STAGE_HOOKS.watermark` span).
- CSS: stage geometry only from tokens `--stage-perspective`, `--stage-gap`, `--stage-tilt`, `--stage-scale-side`, `--stage-item-width`, `--stage-pitch`, `--stage-depth` (the last three added at review, 2026-10-15), motion from `--motion-stage`, `--motion-ease-stage`.
- Events: after the transition settles (debounced 120 ms) the island calls `onCenterChange(id)` when given and always dispatches `CENTER_CHANGE_EVENT` (`plcmuseum:center-change`) on `document` with `CenterChangeDetail` `{ id, decade, era }`; it also does both once after attaching, for the initial exhibit, without announcing it. Astro pages cannot pass functions to an island, so pages and other islands listen to the DOM event. The island also listens to `EXHIBIT_SELECT_EVENT` (`plcmuseum:exhibit-select`, from TimelineScrubber in TASK-004), centers that exhibit, announces it and leaves focus on the sender. The comments in `src/islands/contracts.ts` (updated at review, 2026-10-15) are the full rules.
- Strings: the page passes `labels` resolved with `t(lang, 'stage.prev' | 'stage.next' | 'stage.open')`; the island never imports `src/i18n/utils.ts`, which would ship all five dictionaries (about 13 KB gzip) to the browser. Add no new keys (ask in Questions if you need one).
- CSP (the Worker sends `script-src 'self'; style-src 'self'` plus the hashes of Astro's own inline scripts and style): no `style="..."` attributes in server-rendered markup (the browser drops them); per-item geometry goes through classes, or through CSS custom properties set with `element.style.setProperty()` after hydration (CSSOM writes are allowed). No inline scripts, no `dangerouslySetInnerHTML`. Astro's own hydration scripts are already allowed through build-time hashes (ADR-0010), so the island needs no CSP work.

## Fixtures
`src/fixtures/exhibits.ts`: `fixtureExhibits` (12 fictional cards across the seven decades, two without a photo to exercise silhouettes, one approximate and one disputed year, portrait and wide photos) and `fixtureInitialId`. The fixture page `src/pages/dev/coverflow.astro` already renders them through `StageList` with the era and color-scheme switch (`src/components/dev/FixtureSwitches.astro`).

## Allowed paths
`src/islands/CoverFlow.tsx`, `src/islands/coverflow/**`, `src/styles/coverflow.css`, `src/components/StageList.astro` (styles and behavior hooks only; markup, ids and data attributes stay, except the owner-approved watermark span), `src/pages/dev/coverflow.astro`, `tests/islands/coverflow.*`, `tests/e2e/coverflow.spec.ts`, `tests/e2e/coverflow.spec.ts-snapshots/**`.

## Out of scope
Era theme files, data loading, routing, header rendering, share cards, timeline scrubber (TASK-004), Three.js or any 3D library.

## Requirements
- Accessibility: `role="listbox"` with `aria-activedescendant`, where the option is the item's link `a.card` and the `<li>` has `role="none"` (see the `CoverFlowProps` comment; no interactive control nested in an option), arrow keys, Home/End, Enter opens the exhibit link, focus ring from `--color-focus`, each option keeps the name StageList gives the link (name, manufacturer, yearLabel) and the tagline as description, a live region in both motion modes.
- Reduced motion: `prefers-reduced-motion: reduce` renders the vertical list with the same markup and no transforms; test both.
- Performance: ≤ 45 KB gzip for this island's own chunk (the shared React runtime, about 68 KB gzip, is counted against the page budget, not here); transforms and opacity only; `will-change` only on the three nearest items; 60 fps on a mid-range Android (Chrome DevTools 4x CPU throttle acceptable test proxy).
- Era themes: must look right under all five `data-era` values using tokens only (check `?era=` on the fixture page).
- i18n: no literal copy; "previous", "next", "open" arrive in `labels` (keys `stage.prev`, `stage.next`, `stage.open`).
- Tests: unit tests (`tests/islands/coverflow.test.ts` or `.tsx`) run in Vitest's node environment with no DOM (no jsdom or testing-library: adding one needs the owner's approval). Test pure logic there (index math, wrap-around, debounce, event payloads); keyboard, swipe, aria-live and reduced motion go in `tests/e2e/coverflow.spec.ts` (Playwright, `reducedMotion: 'reduce'` for the reduced variant).

## Acceptance criteria
- [ ] Keyboard, swipe and wheel navigation work; centered item is announced via `aria-live="polite"`.
- [ ] Once per settled change and once after attaching, `onCenterChange` (when given) receives the id and `CENTER_CHANGE_EVENT` is dispatched on `document` with `{ id, decade, era }`; the initial emission is not announced; an `EXHIBIT_SELECT_EVENT` centers and announces the given exhibit and leaves focus on the sender, in both motion modes.
- [ ] No interactive control nested in an option (axe `nested-interactive` passes); every attribute the island sets is restored when the stage deactivates.
- [ ] Stage geometry uses only the stage tokens (no literal widths, pitches or depths).
- [ ] No layout shift when images load (aspect ratio reserved from fixtures); a photo always shows its `credit` next to it.
- [ ] Fixture page renders 12 items at 390 px and 1280 px; captures attached to the PR (Linux baselines and `toHaveScreenshot` are added by the architect after TASK-002, decided at review on 2026-10-15).
- [ ] Reduced-motion variant verified with the OS setting.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

## Verification steps
`pnpm dev` → `/dev/coverflow?era=1980s&theme=dark`; `pnpm test`; `pnpm test:e2e --grep coverflow` (first time: `pnpm exec playwright install chromium`); Lighthouse on the fixture page.

Notes from the Phase 0 integration:
- Astro strips the query string from prerendered pages, also under `astro dev`, so `?era=` and `?theme=` are applied in the browser after load. Screenshot tests must wait for `html[data-era="<era>"]` before capturing.
- The Astro dev toolbar is disabled (astro.config.mjs) so it never appears in screenshots or locators.
- `tests/e2e/pages.spec.ts` already checks the fixture page (12 items, two silhouettes, era switch); keep it green.
- Playwright stores screenshot baselines per platform and CI runs on Linux. Commit Linux baselines (generated in WSL or a Linux container), or attach the 390 px and 1280 px screenshots to the PR and ask in Questions before adding `toHaveScreenshot`.

## Questions (implementer → architect)

## Implementation notes (implementer)

## Review (Claude Code)
