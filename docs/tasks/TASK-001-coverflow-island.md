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
- Props (`src/islands/contracts.ts`):
  ```ts
  export type ExhibitCard = {
    id: string; slug: string; name: string; year: number; decade: Decade;
    tagline: string; image: { src: string; srcset: string; alt: string } | null;
    silhouette: string | null; // path to SVG when image is null
  };
  export type CoverFlowProps = {
    exhibits: ExhibitCard[]; initialId: string; lang: Lang; eraUiEnabled: boolean;
    onCenterChange?: (id: string) => void;
  };
  ```
- Server-rendered fallback: the island hydrates over an existing `<ol class="stage-list">` rendered by `src/components/StageList.astro` (provided). Without JS the list stays usable.
- CSS: stage geometry only from tokens `--stage-perspective`, `--stage-gap`, `--stage-tilt`, `--stage-scale-side`, motion from `--motion-stage`, `--motion-ease-stage`.
- Emits `onCenterChange(id)` after the transition settles (debounced 120 ms).

## Fixtures
`src/fixtures/exhibits.ts` (12 fictional cards across the decades, two without image to exercise silhouettes).

## Allowed paths
`src/islands/CoverFlow.tsx`, `src/islands/coverflow/**`, `src/styles/coverflow.css`, `src/pages/dev/coverflow.astro`, `tests/islands/coverflow.*`, `tests/e2e/coverflow.spec.ts`.

## Out of scope
Era theme files, data loading, routing, header rendering, share cards, timeline scrubber (TASK-004), Three.js or any 3D library.

## Requirements
- Accessibility: `role="listbox"` semantics or equivalent with `aria-activedescendant`, arrow keys, Home/End, Enter opens the exhibit link, focus ring from `--color-focus`, each item has the exhibit name as accessible label.
- Reduced motion: `prefers-reduced-motion: reduce` renders the vertical list with the same markup and no transforms; test both.
- Performance: ≤ 45 KB gzip for this island; transforms and opacity only; `will-change` only on the three nearest items; 60 fps on a mid-range Android (Chrome DevTools 4x CPU throttle acceptable test proxy).
- Era themes: must look right under all five `data-era` values using tokens only (check `?era=` on the fixture page).
- i18n: no literal copy; "previous", "next", "open" labels come from `src/i18n` keys `stage.prev`, `stage.next`, `stage.open`.

## Acceptance criteria
- [ ] Keyboard, swipe and wheel navigation work; centered item is announced via `aria-live="polite"`.
- [ ] `onCenterChange` fires once per settled change with the correct id.
- [ ] No layout shift when images load (aspect ratio reserved from fixtures).
- [ ] Fixture page renders 12 items at 390 px and 1280 px; screenshots committed.
- [ ] Reduced-motion variant verified with the OS setting.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green.

## Verification steps
`pnpm dev` → `/dev/coverflow?era=1980s`; `pnpm test`; `pnpm test:e2e --grep coverflow`; Lighthouse on the fixture page.

## Questions (implementer → architect)

## Implementation notes (implementer)

## Review (Claude Code)
