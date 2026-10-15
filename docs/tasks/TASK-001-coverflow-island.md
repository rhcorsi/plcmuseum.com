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
`src/islands/CoverFlow.tsx`, `src/islands/coverflow/**`, `src/styles/coverflow.css`, `src/components/StageList.astro` (styles and behavior hooks only; markup, ids and data attributes stay, except the owner-approved watermark span), `src/pages/dev/coverflow.astro`, `tests/islands/coverflow.*`, `tests/e2e/coverflow.spec.ts`. No committed screenshots: captures go in the PR.

## Out of scope
Era theme files, data loading, routing, header rendering, share cards, timeline scrubber (TASK-004), Three.js or any 3D library.

## Requirements
- Accessibility: `role="listbox"` with `aria-activedescendant`, where the option is the item's link `a.card` and the `<li>` has `role="none"` (see the `CoverFlowProps` comment; no interactive control nested in an option), arrow keys, Home/End, Enter opens the exhibit link, focus ring from `--color-focus`, each option keeps the name StageList gives the link (name, manufacturer, yearLabel) and the tagline as description, a live region in both motion modes. The attributes on the list, the item and the link, focus ownership, clicks and what the live region announces are spelled out in that comment. Accepted advisory: axe `label-content-name-mismatch` (WCAG 2.5.3) reports every card, because only the full visible text (tagline and credit included) would satisfy it; the name keeps name, maker and year on purpose.
- Reduced motion: `prefers-reduced-motion: reduce` renders the vertical list with the same markup and no transforms; test both.
- Performance: ≤ 45 KB gzip for this island's own chunk (the shared React runtime, about 68 KB gzip, is counted against the page budget, not here); transforms and opacity only; `will-change` only on the three nearest items; 60 fps on a mid-range Android (Chrome DevTools 4x CPU throttle acceptable test proxy).
- Era themes: must look right under all five `data-era` values using tokens only (check `?era=` on the fixture page).
- i18n: no literal copy; "previous", "next", "open" arrive in `labels` (keys `stage.prev`, `stage.next`, `stage.open`).
- Tests: unit tests (`tests/islands/coverflow.test.ts` or `.tsx`) run in Vitest's node environment with no DOM (no jsdom or testing-library: adding one needs the owner's approval). Test pure logic there (index math, wrap-around, debounce, event payloads); keyboard, swipe, aria-live and reduced motion go in `tests/e2e/coverflow.spec.ts` (Playwright, `reducedMotion: 'reduce'` for the reduced variant).

## Acceptance criteria
- [ ] Keyboard, swipe and wheel navigation work; centered item is announced via `aria-live="polite"`.
- [ ] Once per settled change and once after attaching, `onCenterChange` (when given) receives the id and `CENTER_CHANGE_EVENT` is dispatched on `document` with `{ id, decade, era }`; the initial emission is not announced; an `EXHIBIT_SELECT_EVENT` centers and announces the given exhibit and leaves focus on the sender, in both motion modes.
- [ ] No interactive control nested in an option: an e2e test in the active stage finds 12 `option` roles and no match for `[role=option] :is(a[href], button, input, select, textarea, summary, [tabindex])`; every attribute the island sets is restored when the stage deactivates.
- [ ] Stage geometry uses only the stage tokens (no literal widths, pitches or depths); a review check, not covered by tests/styles/tokens-only.test.ts.
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
- Playwright stores screenshot baselines per platform and CI runs on Linux. Attach the 390 px and 1280 px captures to the PR and commit none; Linux baselines and `toHaveScreenshot` are added by the architect after TASK-002 (review decision, 2026-10-15).

## Questions (implementer → architect)

- Resolved by the owner on 2026-10-15: the required decorative year has no existing markup hook. May StageList add one `aria-hidden="true"` span per item while retaining all existing markup, ids and data attributes? Owner approved this specific addition in the task chat.
- Visual baseline handoff: can the architect generate and approve Linux baselines before enabling `toHaveScreenshot` with `maxDiffPixelRatio: 0.001`? This host has Windows Chromium but no usable Linux browser runtime. The task's fallback is used: 26 Windows captures are committed and linked in the PR, and screenshot assertions are not introduced.
- Resolved by the owner on 2026-10-15: `tests/e2e/pages.spec.ts` checks the accessible names of all 12 fixture links, including cards now parked with `visibility: hidden` as the revised contract requires. The owner authorized one line, `await page.emulateMedia({ reducedMotion: 'reduce' })`, before that test opens the fixture, so it verifies the static StageList names. This is the only exception to the task's test paths. The CoverFlow suite separately checks exposed option names and the retained ARIA references on all 12 cards.

## Implementation notes (implementer)

Implemented on 2026-10-15 in `feat/task-001-coverflow`, from `main` at `7642f26`.

- `CoverFlow.tsx` renders controls and a polite, atomic announcement. Its controller enhances the existing list, retaining the original 12 item nodes, links, image dimensions, silhouettes and credits. No dictionary or new dependency enters the browser bundle.
- The list has a single keyboard focus target with listbox/options, named options, active descendant and visible focus. Arrow keys wrap, Home/End jump, Enter follows the selected link, and side clicks select before opening. Controls expose the supplied localized labels and selected exhibit URL.
- Horizontal wheel gestures and pointer swipes navigate. Vertical scrolling, pinch zoom and modified link clicks retain native behavior. Rapid input replaces the pending notification; the last selection emits `{ id, decade, era }` and calls the optional callback after the computed CSS transition plus 120 ms. The initial selection also emits once. Unknown external exhibit ids are ignored.
- Geometry and transition styling consume the stage and motion tokens. Only the center and its two nearest neighbors use `will-change`. The owner-approved year span contains digits only and is `aria-hidden`; readable years and announcements use the supplied localized label.
- The reduced-motion media query restores the original vertical list, link tab order and list semantics, including live preference changes. The no-JavaScript fallback is also covered. The fixture uses `client:load`, because hidden SSR controls do not provide a reliable intersection target for `client:visible`.
- Header rendering, Era UI updates and production CSP hydration remain the architect's integration work. Events are emitted regardless of `eraUiEnabled`; the consumer decides whether to apply the era.

Verification:

- `pnpm lint`: passed, including ESLint and Prettier.
- `pnpm typecheck`: passed, zero errors, warnings or hints from Astro.
- `pnpm test`: 367 tests passed, including six CoverFlow logic tests in the existing Node environment.
- `pnpm build`: passed, 69 routes; fixture pages and unreachable island assets were pruned as configured.
- `pnpm test:e2e --project pages --grep coverflow --workers=2`: 38 tests passed (36 new checks plus two existing fixture checks), including interaction, original node identity, event coalescing, image/credit structure, focus, horizontal wheel, touch input, no JavaScript and reduced motion.
- `pnpm test:e2e tests/e2e/pages.spec.ts tests/e2e/edge.spec.ts --workers=2`: all 35 existing page and Worker regression tests passed.
- 26 PNG captures under `tests/e2e/coverflow.spec.ts-snapshots/`: museum plus five era attributes, light/dark, 390/1280 px, and two reduced-motion views. Tests assert all 12 items, the selected item, decorative year accessibility and no horizontal overflow. These are Windows visual evidence, not Linux comparison baselines.
- The actual minified CoverFlow chunk captured during the production build before fixture pruning is 6,383 bytes, 2,692 bytes gzip (2.63 KiB), below the 45 KB allowance. Shared React/client chunks total 68,814 bytes gzip, counted separately. The home integration and its complete 150 KB budget are not part of this fixture-only delivery.
- Lighthouse 13.5.0 mobile on the compiled fixture: performance 99, accessibility 100, best practices 96; LCP 1.8 s, CLS 0.036, TBT 60 ms. The fixture HTML and assets were captured before the existing build hook pruned them and served locally with gzip, without modifying configuration. The best-practices deduction was a missing favicon on this temporary server. This is not a production Worker/CSP measurement. The initial Astro-dev run scored 48/97/100 and loaded development modules; its decorative-year contrast finding was corrected before the final compiled run and screenshots.
- Chromium 1248 on Windows, 390 x 844, CDP CPU throttle 4x, eight transitions on the compiled fixture: 395 frame intervals, median 16.7 ms, p95 16.8 ms, mean 59.25 fps, one interval over 33.4 ms (maximum 49.9 ms), zero long tasks, zero layout shift during navigation, three items with `will-change`. This is the task's desktop proxy, not a physical-device claim of sustained 60 fps.

Limits for integration review:

- TASK-002's era files on this base are empty token overrides, so all era attributes currently inherit the museum appearance. Recheck the screenshots after Gemini's themes are integrated.
- Playwright verified the browser's reduced-motion setting both initially and during interaction. A manual Windows accessibility-setting check and physical Android test have not been performed.
- Lighthouse's unweighted label/content advisory lists the cards, whose accessible names intentionally follow the contract's exhibit-name labels while visible cards also contain credits, year and metadata. Review this with assistive technology during integration; the scored accessibility checks pass.
- No merge or deployment was performed. No architecture, contracts, content, Worker, configuration, dependencies or other documentation was changed.

### PR #9 review revision (2026-10-15)

This revision follows the architect's review and the contracts merged in `fc24980`. The earlier measurements and screenshot handoff above describe the first implementation; the evidence below supersedes them for the revised code.

- Merged `main`, retaining the stable link/maker ids and the owner-approved watermark with `STAGE_HOOKS.watermark`. The island waits for `DOMContentLoaded` when necessary, removes that listener on cleanup, attaches once per `listId`, and invokes the latest callback through a ref.
- The links are the listbox options with position/size and selection attributes; items have only `role="none"`. The original link names and descriptions remain intact, option focus returns to the list, and deactivation restores the attributes. Open describes the selected exhibit.
- The live region remains outside the controls in both motion modes. Initial and keyboard changes are silent; controls, gestures and external picks announce. Silent changes clear the previous text so returning through a control can announce the same exhibit again. The initial event/callback is synchronous after setup, independent of navigation debounce, with external listeners already registered.
- Reduced-motion external picks scroll without taking focus. Runtime preference changes transfer focus from the list or controls to the selected native link; returning to the stage centers the focused static link. Controls are hidden only after the controller has transferred focus.
- Controls reserve their block size before hydration. The initial layout uses a short initialization phase with no transitions; cards become visible after their geometry has been painted, while the listbox remains focusable. The unenhanced no-JavaScript or blocked-script fallback stays visible. Measured buffered CLS: 0.000827 at 390 px and 0.000177 at 1280 px, below 0.05.
- Visual offsets are clamped to plus/minus 2. Distant cards are parked without transitions or repeated property writes; updates touch old/new neighbors only. Offset jumps greater than one step do not animate, including 2/3/4-item wrap-around tests. Width, pitch and depth use the new stage tokens. The watermark offset shares its font-size clamp, leaving all four digits above the card.
- Removed all 26 committed Windows PNGs. Four museum captures at 390/1280 px in normal/reduced motion are generated as Playwright attachments and were inspected locally. The screenshot question above is superseded by the review: Linux baselines remain the architect's work after TASK-002. Uploading the four images to the PR is still pending because the available browser connection cannot operate the authenticated GitHub editor; no replacement images are committed.

Verification of this revision:

- `pnpm lint` and `pnpm typecheck`: passed, Astro reported zero errors, warnings or hints.
- `pnpm test --maxWorkers=1 --testTimeout=60000`: all 395 tests passed, including 14 CoverFlow logic tests. Earlier local runs hit the default five-second timeout in unchanged content/tooling subprocess tests; the timeout override is command-line only, with no configuration change.
- `pnpm build`: passed. The final e2e build also passed with the existing `PLCMUSEUM_E2E_FIXTURES=1` option, which includes the architect's CSP fixture and is not a deployment artifact.
- Browser regressions cover a parser blocked before the list, immediate external selection from the initial event, exact focus token colors, names and ARIA restoration, live-region policy, both motion modes, gestures, parked writes, short collections, initial animation and buffered CLS.
- `pnpm test:e2e --workers=2 --output=test-results/final-all`: all 66 tests passed, including 28 CoverFlow checks and 38 existing page/Worker checks. The parser-race test first warms the island module so its hydration can race the intentionally blocked parser even on a cold development server.
- The full e2e run exposed an existing shared test that expects accessible names on parked hidden links (`tests/e2e/pages.spec.ts`). The owner authorized its one-line reduced-motion setup, recorded in Questions. The production CSP tests, including the existing island-hydration fixture, passed. This does not replace the architect's pending CoverFlow-specific CSP integration test or OS-level reduced-motion check.

The Review section is untouched. No dependency, contract, token, build/CI configuration, content or Worker implementation was edited. No merge of this PR or deployment was performed.

### Linux fixture follow-up (2026-10-15)

The first Linux run passed 65 of 66 e2e tests. Buffered layout-shift sources isolated the 390 px failure (0.102403) to the fixture toolbar: its initial "Scheme: OS preference" status occupied two lines, then became one line after the browser resolved "dark", moving the controls and list up by 24 px. The fixture now keeps the two status spans in separate rows below 48 rem. This changes only `src/pages/dev/coverflow.astro`, without changing the shared toolbar or the 0.05 CLS budget. Local measurements after the fix were 0.001597 at 390 px and 0.000177 at 1280 px; the no-JavaScript and reduced-motion variants retain all 12 visible cards. Failed CLS assertions now include the affected elements and rectangles for diagnosis.

## Review (Claude Code)
