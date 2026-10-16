status: ready
id: TASK-004
title: TimelineScrubber island (React)
assignee: codex
branch: feat/task-004-timeline-scrubber
depends_on: [TASK-001]
created: 2026-10-15

## Goal
A slim timeline beside the stage: a tick per exhibit, oldest on the left, under decade labels, and a readout (year, then name) that follows the thumb. A drag, a press or tap on the track, or a key commits a pick that glides the stage there (under reduced motion the list scrolls to it); focus stays on the timeline, and the thumb follows when the stage moves another way. Screen readers get a standard slider whose value names the exhibit, once per step. Without JS nothing shows.

## Contract

### Prerequisites (on `main` before you start; merge `main` first)
1. TASK-001 (PR #9) with follow-ups F1 and F2: CoverFlow sets `data-center-id="<id>"` on its list right before every `CENTER_CHANGE_EVENT` (initial one included, both motion modes), removes it only on unmount, and centers `EXHIBIT_SELECT_EVENT` picks without announcing them.
2. The TASK-004 contract PR: types, `src/lib/timeline.ts`, `src/fixtures/timeline.ts`, `timeline.*` keys, and an `/e2e/<name>` page per `tests/e2e/fixtures/*.astro` in `PLCMUSEUM_E2E_FIXTURES=1` builds.

The comments of `TimelineScrubberProps`, `EXHIBIT_SELECT_EVENT`, `CENTER_CHANGE_EVENT` and `STAGE_HOOKS` in `src/islands/contracts.ts` are the source of truth; this file adds the details.

### Component
- `src/islands/TimelineScrubber.tsx`, default export, props `{ items: TimelineItem[]; listId; labels: { label; decades: Record<Decade, string> }; onSelect? }`, `TimelineItem` = `{ id, yearLabel, name, decade, valueText }`. It imports only `react`, `./contracts`, `./timeline-scrubber/*` and its stylesheet `src/styles/timeline-scrubber.css` (never `src/i18n/utils.ts`, `src/lib/*`, `src/content/*`). Ids `{listId}-scrubber` and `{listId}-scrubber-label`, never `useId`.
- Every decision goes through `src/islands/timeline-scrubber/model.ts` (review check; names fixed, shapes yours): `initialState(items, centerAttr, initialAttr)` → `{ index, lastId }`; `decadeRuns(items)` → `{ decade, start, end }[]` per run of consecutive same-decade items; `pageIndex(runs, index, direction)`; `commit(state, id, dispatch, callbackRef)`; `follow(state, id, items)`; the drag model (`startDrag`, `endDrag`, `cancelDrag`, or one reducer); `nearestIndex(x, axisStart, axisSize, count)`; `fitDecadeLabels({ runs, widths, axisStart, axisSize, count, rowSize, gap })`.
- A native `<input type="range">` (not `div role="slider"`, not a listbox), one step per exhibit, evenly spaced in `items` order (ordinal, not years: owner decision 2026-10-15), left to right only.

### Render and attach
- Server and first client render: exactly `<div class="timeline-scrubber" data-ready="false"></div>`; under two items, empty output. CSS: `@media (scripting: none) { .timeline-scrubber[data-ready='false'] { display: none; } }`.
- Attach in an effect, after a one-shot `DOMContentLoaded` (removed in cleanup) while `document.readyState === 'loading'`. Then synchronously: `list = document.getElementById(listId)`; add the `CENTER_CHANGE_EVENT` listener on `document`; `{ index, lastId } = initialState(items, list?.dataset.centerId, list?.dataset.initialId)` (the `data-center-id` item, else `data-initial-id`, else the first; unannounced, nothing dispatched); set `data-ready="true"`.
- Once per `listId`; `items` and `onSelect` read through refs (new equal props or a new `onSelect` never re-attach or reset). Unmount removes every listener (document, window, `DOMContentLoaded`) and the `ResizeObserver`. Nothing is written outside the root.

### Markup after attach
```html
<div class="timeline-scrubber" data-ready="true">
  <span class="timeline-scrubber__label" id="{listId}-scrubber-label" aria-hidden="true">{labels.label}</span>
  <span class="timeline-scrubber__readout" aria-hidden="true">
    <span class="timeline-scrubber__year">{item.yearLabel}</span>
    <span class="timeline-scrubber__name">{item.name}</span>
  </span>
  <div class="timeline-scrubber__track">
    <div class="timeline-scrubber__axis" aria-hidden="true">
      <span class="timeline-scrubber__tick" data-id="{id}" data-decade="{decade}" data-decade-start="true"></span>
    </div>
    <input class="timeline-scrubber__input" id="{listId}-scrubber" type="range" min="0" max="{items.length - 1}"
      step="1" value="{index}" aria-labelledby="{listId}-scrubber-label" aria-valuetext="{item.valueText}"
      aria-controls="{listId}" />
  </div>
  <div class="timeline-scrubber__decades" aria-hidden="true">
    <span class="timeline-scrubber__decade" data-decade="{decade}" data-current="true" data-fits="true">{labels.decades[decade]}</span>
  </div>
</div>
```
- A tick per item in order (`data-decade-start="true"` only on each run's first); a label per decade run (`data-current="true"` only on the run of `{item}`, the item at the thumb, drag preview included). `aria-valuetext`, readout and `data-current` follow every value change.
- The caption names the input through `aria-labelledby`. The input is the only focusable and exposed element: no `role`, `tabindex`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-orientation` or `aria-label`; no `aria-live` anywhere; the readout is never an `<output>` (an implicit live region). `aria-controls` only when `#{listId}` exists at attach.
- The fit, not React, writes `data-fits` and `--timeline-label-x` on every label before the first paint after attach. Classes, ids and data attributes are the test hooks.

### Keyboard and pointer
| Key | Result |
|---|---|
| Right and Up (next), Left and Down (previous), Home, End | native, no wrap |
| PageUp | first of the next decade run; in the last run, the last exhibit |
| PageDown | first of the current run; if already there, first of the previous run; in the first run, stays |

PageUp and PageDown use `pageIndex` in React `onKeyDown` with `preventDefault()`. Nothing else: Enter and Space inert, no wheel, keys with Alt, Ctrl or Meta untouched. Values arrive through `onChange` (native `input`), never `change`.
- A drag starts at `pointerdown` on the input with `isPrimary` and `button === 0`; window `pointerup` and `pointercancel` act only on its `pointerId`; state lives in refs. A drag previews and dispatches nothing.
- `pointerup` commits the value if an `input` event came since `pointerdown`, else (iOS Safari track tap, click on the thumb) reads the axis rect once, then sets and commits `nearestIndex(event.clientX, axis.left, axis.width, items.length)`: any press on the track picks the nearest tick (WCAG 2.5.7).
- `pointercancel` on that `pointerId`, or `blur` mid-drag, aborts to the `lastId` item with no dispatch (WCAG 2.5.2): a vertical swipe begun on the scrubber scrolls and picks nothing. `touch-action: pan-y` on the input.

### Events and focus
- **Commit** on an `input` event outside a drag, a PageUp or PageDown change, or `pointerup`. `lastId` = the last id dispatched, followed or taken at attach. `commit` ignores `lastId`, otherwise sets `lastId`, dispatches `new CustomEvent(EXHIBIT_SELECT_EVENT, { detail: { id } })` on `document`, then calls the latest `onSelect(id)`, synchronously in the handler that changed the value (no timer, debounce, `requestAnimationFrame` or idle callback). Never at attach, mid-drag, on abort, on follow, on focus or blur, or on prop changes.
- **Follow:** a known `CENTER_CHANGE_EVENT` id sets `lastId` and, outside a drag, the thumb; no dispatch, no `onSelect`; unknown ids ignored. After a mid-drag follow, `pointerup` commits a thumb that differs from the new `lastId`; an abort returns to it.
- No live region; nothing announces the initial, late or followed value. Never `focus()`, `blur()` or scrolling; focus stays on the input in both motion modes.

### Geometry and labels
- **Travel:** the input has no padding, border or margin; `::-webkit-slider-runnable-track` and `::-moz-range-track` have none in the inline direction. `--timeline-thumb-size` (`t`) is the thumb's inline size in `::-webkit-slider-thumb` and `::-moz-range-thumb`; value `i` centers at `inputLeft + t / 2 + i * (inputWidth - t) / (n - 1)`. The axis spans that travel (inset `t / 2` each end): zero-width ticks with `justify-content: space-between`, each mark a centered pseudo-element. No equal cells, no per-item geometry in markup.
- **Stacking:** axis under the input; transparent input background, track line and thumb in the pseudo-elements; `pointer-events: none` on caption, readout, axis and decades row; WebKit and Gecko pseudo-element rules in separate blocks (both engines drop a selector list that mixes them).
- **Decades row:** the track's inline start and size, one line tall; labels absolutely positioned at its start, `white-space: nowrap`, moved by `--timeline-label-x` through a transform or `translate`.
- **Fit:** each label centered over its run's ticks, clamped to `[0, rowSize - width]`, oldest first, `null` if its start is less than `gap` after the end (start plus width) of the previous fitted label. Inputs in px: row size, axis start and size relative to the row (first to last tick center), label widths, `gap` = resolved `--space-1` (e.g. the row's computed `column-gap`, set to `var(--space-1)`). A layout effect writes `--timeline-label-x` (`element.style.setProperty()`) and `data-fits="true"`/`"false"`; unfitted labels get `visibility: hidden`, never `hidden` or `display: none` (boxes stay measurable, so the `ResizeObserver` cannot loop). One `ResizeObserver` on the row and every label re-runs it. Layout is read only there and in the one axis rect of `pointerup`.
- **Current run:** `--color-text` with `text-decoration-line: overline`, `text-decoration-thickness: calc(var(--border-width) * 2)`; others `--color-text-muted`, undecorated. No state changes `font-weight`, `font-size`, `letter-spacing`, padding or border (a width change would re-run the fit mid-drag).
- **Sizes:** the input spans the track, at least 2.75rem tall; the thumb at least 2.75rem tall (block size, set separately) and at least 1.5rem wide (`--timeline-thumb-size`).

### Layout, color, CSS
- **Reserved space:** root `min-block-size: var(--timeline-scrubber-size)` (never `block-size`/`height`), no block padding and no border. `:root` declares one rem-based `--timeline-*` per row (a `--text-*` token times a unitless line-height, or the input height), used as that row's `min-block-size`, and `--timeline-scrubber-size` = their sum plus gaps. Rows: caption (one line), readout (three lines: year one, name two), track, decades (one line).
- **Wrap, never clip:** no `overflow: hidden`/`clip`, ellipsis, fixed `block-size` or `height`; year and name `display: block`; caption and name may wrap; only text needing more lines (larger text, WCAG 1.4.12) grows the root. Root inline padding at least `calc(var(--border-width) * 2 + 2px)` (ring room).
- **Color:** no own background (it sits on `--color-bg` or `--color-surface`); thumb fill and border `--color-accent`; track line `--color-text-muted` or `--color-text`, never `--color-border`, at most `calc(var(--border-width) * 2)`; thumb outline and track line as borders (forced colors).
- **CSS and CSP:** no `style` prop, inline script, `dangerouslySetInnerHTML` or `<style>`; runtime geometry only through `element.style.setProperty()`; hydration needs no CSP work (ADR-0010). Tokens only (`--color-*`, `--font-*`, `--text-*`, `--space-*`, `--radius-*`, `--border-width`, `--shadow-*`, `--motion-*`), own properties `--timeline-*`, no `--stage-*`. `appearance: none` with both pseudo-element families. No `outline` on the input or its pseudo-elements: the global `:focus-visible` rule (`@layer base`) draws the ring, and this unlayered stylesheet would override it.
- DecadeSelector is not imported, edited, wrapped or enhanced (WCAG 3.2.4). `labels` = `timelineLabels(lang)`; no new keys (ask in Questions).

## Fixtures
- `fixtureTimelineItems`, English, stage order: 0 `fx-relay-replacer-r1`, 1 `fx-logic-cabinet-lc20` (approximate), 2 `fx-process-hiway-ph1`, 3 `fx-octal-rack-or5`, 4 `fx-phosphor-terminal-pt80` (disputed), 5 `fx-multiloop-ml8`, 6 `fx-bevel-station-bs95`, 7 `fx-fieldbus-node-fn3`, 8 `fx-gloss-panel-gp2003`, 9 `fx-tag-engine-te7`, 10 `fx-flat-hmi-fh12`, 11 `fx-edge-pac-ep21`. Runs: [0] 1960s, [1-2] 1970s, [3-5] 1980s, [6-7] 1990s, [8-9] 2000s, [10] 2010s, [11] 2020s. **vt(i)** = index `i`'s `valueText`: vt(3) "Octal Rack OR-5, Fixture Controls, 1984", vt(4) "Phosphor Terminal PT-80, Example Industrial, approx. 1986", vt(5) "Multiloop ML-8, Sample Process Systems, 1989", vt(6) "Bevel Station BS-95, Example Industrial, 1993".
- Pages (tooling, literal English): a header comment (what the page tests; never shipped), `<Base lang="en" title="<title>" path={null} noindex>`, `<main id="main" tabindex="-1">`. StageList `exhibits={fixtureExhibits} lang="en" initialId={fixtureInitialId} label="Fixture exhibits"`, plus `coverflow` on pages that mount CoverFlow (it paints the stage before hydration; see `STAGE_HOOKS.pending`); CoverFlow `client:load exhibits={fixtureExhibits} listId="stage" initialId={fixtureInitialId} lang="en"` (no `eraUiEnabled`: deprecated and ignored since the TASK-001 integration), `labels` from `t('en', 'stage.prev' | 'stage.next' | 'stage.open')`; scrubber `items={fixtureTimelineItems} listId="stage" labels={timelineLabels('en')}`. Each page has its elements in exactly this order (tests j and k depend on it):
  1. `src/pages/dev/timeline-scrubber.astro`, "TimelineScrubber fixture": `<h1>`; `<FixtureSwitches page="/dev/timeline-scrubber" />`; `<div class="scrubber-bar">` around `<TimelineScrubber client:load>`; `<p class="after">This line follows the scrubber: a layout shift caused by the scrubber would move it.</p>`; CoverFlow; StageList. `<style>`: `main { display: grid; gap: var(--space-4); max-inline-size: 72rem; margin-inline: auto; padding: var(--space-6) var(--space-4); }`, `h1 { margin: 0; font-family: var(--font-display); font-size: var(--text-2xl); }`, `p { margin: 0; color: var(--color-text-muted); }`, `.scrubber-bar { position: sticky; inset-block-start: 0; z-index: 1; padding-block: var(--space-2); background: var(--color-bg); }`, `:global(html) { scroll-padding-block-start: calc(var(--timeline-scrubber-size) + var(--space-2) * 2); }`, `@media (width < 48rem) { main :global(.fixture-switch__status) { flex-direction: column; } }`.
  2. `src/pages/dev/timeline-scrubber-late.astro`, "TimelineScrubber late-attach fixture": `<h1>`; CoverFlow; StageList; `<div class="spacer"></div>`; `<TimelineScrubber client:visible>`. `<style>`: only the `main` and `h1` rules above and `.spacer { block-size: 200vh; }`.
  3. `tests/e2e/fixtures/timeline-scrubber.astro` (`/e2e/timeline-scrubber`), "TimelineScrubber fixture": `<h1>`; StageList; `<TimelineScrubber client:visible>`; no CoverFlow, no `<style>`. Add no other `.astro` file there (each one becomes an `/e2e/` page; `islands.astro` and `coverflow.astro` stay).

## Allowed paths
`src/islands/TimelineScrubber.tsx`, `src/islands/timeline-scrubber/**`, `src/styles/timeline-scrubber.css`, `src/pages/dev/timeline-scrubber.astro`, `src/pages/dev/timeline-scrubber-late.astro`, `tests/islands/timeline-scrubber.*`, `tests/e2e/timeline-scrubber.spec.ts`, `tests/e2e/timeline-scrubber.edge.spec.ts`, `tests/e2e/fixtures/timeline-scrubber.astro`, and this file's Questions and Implementation notes. Everything else is read-only (contracts, CoverFlow, components, fixtures, lib, i18n, layouts, other styles and tests, configs, `package.json`, `pnpm-lock.yaml`): write a needed change in Questions and wait for an approval recorded in the PR. No committed screenshots.

## Out of scope
Real pages (placement, directive, stickiness, the "Browse by decade" grid: decided at integration, keeping this task's reduced-motion property). Changes to DecadeSelector, StageList or CoverFlow. Era UI (TASK-005), header sync. Year-proportional axis, wrap, tick tooltips, clickable decade labels, wheel scrubbing, autoplay, right-to-left, share cards. Dependencies (no jsdom, testing-library, axe). Linux baselines and `toHaveScreenshot` (architect, after TASK-002).

## Requirements
- Accessibility: thumb at 3:1 or more against the background in every era; thumb and track visible in forced colors; the ring is the global `calc(var(--border-width) * 2) solid var(--color-focus)`, offset 2px.
- Reduced motion: identical behavior, no `matchMedia`; no commit mid-drag, so the page never scrolls during one. After each pick the input and the item are in the viewport, the item not under the scrubber, through the placement (the fixture page's sticky bar and scroll padding). Any added transition (opacity or transform, `--motion-fast`) has a `prefers-reduced-motion: reduce` variant with none.
- Performance: own chunk at most 8 KB gzip; memoized ticks (a value change re-renders input, readout and decade emphasis only; review); longest task while dragging across all ticks at 4x CPU throttle under 50 ms, in DevTools on `/e2e/timeline-scrubber` under `wrangler dev` (`astro dev` serves React's development build).
- Era themes: no theme file edited; right under `museum` and the five `data-era` values, light and dark, with the themes on main when you start.
- i18n: no literal copy in the island; `timeline.label` (en "Timeline of exhibits", pt "Linha do tempo das peças"), `timeline.value` ("{name}, {maker}, {year}"), `decade.<decade>`.

### Tests (each must fail on the regression it names, or it is not done)
- Unit, `tests/islands/timeline-scrubber.test.ts[x]`: Vitest node environment, no DOM library (owner approval needed); `react-dom/server` may render the island.
- E2E, `tests/e2e/timeline-scrubber.spec.ts`, one `test.describe('timeline-scrubber')`, `reducedMotion: 'no-preference'`, 1280x720 unless stated. One `addInitScript` before navigation (as in `coverflow.spec.ts`) records: **sel** (the `EXHIBIT_SELECT_EVENT` ids) and the `CENTER_CHANGE_EVENT` ids; from bubble-phase `window` listeners, `{ type, key, value, defaultPrevented, selects }` per `keydown` and `input` on `#stage-scrubber` (`selects` = sel count then); `window` `error` messages; buffered `layout-shift` entries without recent input, by source (root, inside it, `.scrubber-bar`, `.after`); at `readystatechange` to `"interactive"`, the root's `data-ready` and rect and the rects of the bar and `.after`; at the root's first `data-ready="true"` (`MutationObserver`), `document.readyState` and whether `#stage` exists. Every test ends with no console, page or recorded window error.
- **ready** (one helper, pages with CoverFlow): `.timeline-scrubber[data-ready="true"]` and `#stage[data-center-id]`. Wait only on page state (after `?era=`, `html[data-era="<era>"]`), recorded events (CoverFlow's settle is its `CENTER_CHANGE_EVENT`) or **2f** (a `page.evaluate` resolving after two nested `requestAnimationFrame`s); never `waitForTimeout`. Tick center: its box's center x, at the input's vertical center. Tokens resolve on a probe element added and removed inside the root in one `evaluate`.

Unit:
1. `renderToStaticMarkup` (fixtures, `listId="stage"`, `timelineLabels('en')`) is exactly the empty root; `''` with one item and with none.
2. `initialState`: known `data-center-id` wins; unknown or absent falls back to `data-initial-id`, then the first item; `lastId` is the chosen id.
3. `pageIndex` (start: PageUp, PageDown): 3: 6, 1; 4: 6, 3; 5: 6, 3; 0: 1, 0; 9: 10, 8; 10: 11, 8; 11: 11, 10.
4. `commit`: nothing for `lastId`; else `lastId`, `dispatch({ id })`, `callback.current(id)`, in order; the latest callback after a ref change.
5. `follow` ignores unknown ids and moves the index only outside a drag (`lastId` always). Preview, cancel: no dispatch, back to `lastId` (also after a mid-drag follow). Preview, release: one commit with the thumb's id. Release on `lastId`: none. Another `pointerId` never ends the drag.
6. `fitDecadeLabels`: all fit on a wide row; an overlapping newer label is `null`; both ends clamp; exactly `gap` fits, `gap - 1` does not. `nearestIndex`: 0 before the axis, `count - 1` after; 0.5 px before each midpoint of `k` and `k + 1` gives `k`, 0.5 px after gives `k + 1`.
7. Raw scan (`import.meta.glob` with `?raw`, as `tests/styles/tokens-only.test.ts`) of the island and `src/islands/timeline-scrubber/**` (assert the glob returned both `/src/islands/TimelineScrubber.tsx` and `/src/islands/timeline-scrubber/model.ts`, so neither can be skipped silently): no `setTimeout`, `setInterval`, `requestAnimationFrame`, `requestIdleCallback`, `matchMedia`, `useId`, `aria-live`, `<output`, `dangerouslySetInnerHTML`, comments included. `src/styles/timeline-scrubber.css`, read with `readCssFiles` (`tests/styles/read-css.mjs`; Vitest empties CSS imports) and asserted present: no `outline` declaration, no `--stage-`, no `overflow` or longhand set to `hidden` or `clip`, no `text-overflow`, `display: none` only inside `@media (scripting: none)`.

E2E, pages project (`/dev/timeline-scrubber` after ready unless stated):
- (a) Exactly one `getByRole('slider', { name: 'Timeline of exhibits' })`: type `range`, min 0, max 11, step 1, value 3, vt(3), `aria-controls="stage"`, `aria-labelledby="stage-scrubber-label"`, no attribute beyond the markup's (all but `value` present). `.timeline-scrubber :is([aria-live], [role], [tabindex], output)` matches nothing; `.timeline-scrubber :is(a[href], button, input, select, textarea, summary, [tabindex])` one. Tick `data-id`s in fixture order; `.timeline-scrubber__tick[data-decade-start="true"]` matches exactly indexes 0, 1, 3, 6, 8, 10, 11; seven labels in decade order; readout "1984", "Octal Rack OR-5".
- (b) `slider.focus()`, ArrowRight: that `input` entry has `selects: 1`; sel `['fx-phosphor-terminal-pt80']`; vt(4). After its `CENTER_CHANGE_EVENT` and 2f: still one sel, focus on `#stage-scrubber`, `#stage` `aria-activedescendant="stage-link-fx-phosphor-terminal-pt80"`, CoverFlow's `[aria-live]` empty. Fails with a deferred dispatch or a focus move.
- (c) Focused at 3: Enter, Space, Home, ArrowLeft, PageDown, PageUp, PageUp, ArrowRight, PageDown, PageDown, End, ArrowRight, PageUp, PageDown, PageDown give 3, 3, 0, 0, 0, 1, 3, 4, 3, 1, 11, 11, 11, 10, 8; sel exactly ids 0, 1, 3, 4, 3, 1, 11, 10, 8, each counted in its cause's entry (`input` for arrows, Home, End; `keydown` for PageUp, PageDown); `defaultPrevented` true on PageUp and PageDown `keydown`s only; URL unchanged. Fails with wrap, a same-value dispatch, a missing `preventDefault()` (Chromium's own page step) or a deferred dispatch.
- (d) Focus `#stage`, ArrowRight, wait for the slider's vt(4); ArrowRight, wait for vt(5); zero sel. `slider.focus()`, ArrowRight: sel `['fx-bevel-station-bs95']`. Fails if it ignores or echoes `CENTER_CHANGE_EVENT`.
- (e) Mouse down at tick 3, move (`steps: 10`) to tick 6, wait for readout "1993", "Bevel Station BS-95": zero sel, vt(6); release: sel `['fx-bevel-station-bs95']`. Press at 6, move to 8 and back, release: nothing new. Fails with mid-drag commits or a same-value release dispatch.
- (f) 1280x720 and 390x844, `t` resolved: each tick center within 0.5 px of `inputLeft + t / 2 + i * (inputWidth - t) / 11`; `elementFromPoint` there is the input; per pair (k, k + 1), the thumb moved away before each click (focus, End when k < 6, else Home), a click 1.5 px left of the expected midpoint gives k, 1.5 px right gives k + 1. Fails with equal cells (about 30 px off at 1280 px), a wrong inset, input or track padding or border, or an overlay.
- (g) `hasTouch`, 390x844: `touchscreen.tap()` at tick 9 gives 9, sel `['fx-tag-engine-te7']`.
- (g2) Fresh page, 390x844, CDP `Emulation.setTouchEmulationEnabled` (as the swipe test of `coverflow.spec.ts`), `Input.dispatchTouchEvent`: `touchStart` at tick 9, `touchMove` up 40, 80, 120, 160, 200 px, `touchEnd`: `scrollY` changed, an `input` entry with 9 during it, value back to 3, zero sel. Fails if `pointercancel` commits. If Chromium neither previews nor pans: `test.fixme` with the reason, noted; unit 5 and the device check cover it.
- (h) `/dev/timeline-scrubber-late`: at `#stage[data-center-id="fx-octal-rack-or5"]`, `data-ready="false"`; `#stage` ArrowRight twice, at `fx-multiloop-ml8` still `"false"`, also right before `scrollIntoViewIfNeeded()`; at `"true"`: vt(5), zero sel; a click on the thumb in place (tick 5): zero sel; `#stage` ArrowRight, wait for vt(6); `slider.focus()`, ArrowRight: sel `['fx-fieldbus-node-fn3']`. Fails if it starts from `data-initial-id`, with `lastId` unset, or echoes a follow.
- (i) `reducedMotion: 'reduce'`, slider focused; picks End (`#stage-item-fx-edge-pac-ep21`), Home (`#stage-item-fx-relay-replacer-r1`), a mouse drag 0 to 6 (`#stage-item-fx-bevel-station-bs95`, zero new sel and unchanged `scrollY` until release), each item first asserted outside the viewport. After each (`expect.poll`): one new sel for it; its top at or below `.scrubber-bar`'s bottom (1 px) and above the viewport's; the input inside the viewport; focus on the slider. Fails if a pick hides the input or the item, or commits mid-drag.
- (j) 1280x720 and 390x844: focus the last `.fixture-switch__link`, Tab reaches `#stage-scrubber`; `outline-style: solid`, `outline-color` the resolved `--color-focus`; at 390 px the input rect grown by `outline-width` plus `outline-offset` is inside the root and the viewport. Fails with the default ring, an island `outline` or clipping.
- (k) Museum, 1280x720 and 390x844: the `readystatechange` record has `data-ready="false"`, the root inside the viewport, `.after`'s top inside it. After ready, eager decoded stage images (as `coverflow.spec.ts`), `document.fonts.ready`, 2f: the root's block size equals the recorded one (0.5 px); no shift sourced in the root, inside it, the bar or `.after`. Fails with no or too small a reservation.
- (k2) 1280x720, 390x844, 320x720, museum and `?era=1980s` (after `html[data-era="1980s"]`): focus the slider, Home, then ArrowRight 11 times; each time the root's block size equals its computed `min-block-size` (0.5 px). Fails when it computes to 0 or `auto` or is too small.
- (l) Fitted = `data-fits="true"`. 1280x720: seven fitted, disjoint, inside the row, at least `--space-1` apart. Loaded at 390x844: 1960s fitted; fitted labels disjoint, inside the row and at least `--space-1` apart (not all seven); at 1280x720 seven; back at 390x844 the first set, stable for 2f. 320x720: root `scrollWidth` ≤ `clientWidth`, box in the viewport, readout, input and fitted labels disjoint. `overline` only on `data-current="true"`, colored `--color-text`, others `--color-text-muted`; after End, `data-current` only on 2020s; no width changes. Fails with overlap, clipping, a `ResizeObserver` loop, `display: none`, a color-only cue or a width change.
- (l2) 390x844 and 320x720: `addStyleTag` `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-block-end: 2em !important; }`, 2f, slider ArrowRight (index 4, longest readout): readout, input and fitted labels disjoint; readout `scrollHeight` and `scrollWidth` within its `clientHeight` and `clientWidth`; root `scrollWidth` ≤ `clientWidth` (the root may grow). Fails with `overflow: hidden`, ellipsis or a fixed height.
- (m) After one ready load (module cache), route `**/__timeline-parse-barrier.js` to wait for a release promise, then fulfill an empty script, and `/\/dev\/timeline-scrubber\?barrier=1$/` to insert `<script src="/__timeline-parse-barrier.js"></script>` before `<ol` with id `stage` (assert the match). Start `waitForRequest`, then an unawaited `goto('/dev/timeline-scrubber?barrier=1')`; at the request: `#stage` count 0; wait for `astro-island:has(.timeline-scrubber):not([ssr])`; after 2f still `data-ready="false"`. Release, await the navigation and `data-ready="true"`: the attach record has `#stage` and `readyState` not `"loading"`; `aria-controls="stage"`, value 3. Fails if attach skips the `DOMContentLoaded` wait.
- (n) `javaScriptEnabled: false`: the root computes `display: none`; `#stage` has 12 `.stage-item`s, the first visible. If Chromium ignores `(scripting: none)` there, `test.fixme` that assertion only, check Chrome with JS blocked, note it.

E2E, edge (`tests/e2e/timeline-scrubber.edge.spec.ts`): `/e2e/timeline-scrubber` answers 200; errors collected as in `tests/e2e/edge.spec.ts`; an init script records sel and, from `DOMContentLoaded`, mutations under `document.documentElement` (subtree, attributes, childList). In view and `data-ready="true"`: `aria-controls="stage"`, value 3; slider ArrowRight: sel `['fx-phosphor-terminal-pt80']`, no errors, no mutations except inside the root, on `astro-island` elements, and `head` `childList` adds of only `link` or `script`. Fails when hydration is blocked or the island writes outside its root.

## Acceptance criteria
- [ ] Render, attach and markup per Contract: empty reserved root (empty output under two items), hidden without scripting, exact attributes, named by the caption, one tab stop, no live region or `<output>`; keys per the table, `preventDefault()` on PageUp and PageDown only (unit 1, 2, 3; e2e a, c, n).
- [ ] One synchronous `EXHIBIT_SELECT_EVENT`, then `onSelect`, per committed pick; none at attach, mid-drag, on abort, on follow or for `lastId`; follow without echo; attach waits for the list (unit 4, 5, 7; e2e b, c, d, e, g2, h, m).
- [ ] A drag previews and commits on release; presses and taps pick the nearest tick; ticks match the thumb's travel; every press reaches the input, at 390 and 1280 px (unit 6; e2e e, f, g).
- [ ] Focus stays on the input; under reduced motion item and input stay in view and uncovered; the ring is solid, `--color-focus`, unclipped (e2e b, i, j).
- [ ] No layout shift (e2e k, k2); wrap without clipping or overlap, labels fitted with the gap and no `ResizeObserver` loop, overline plus color cue, constant widths (unit 6, 7; e2e l, l2).
- [ ] Production CSP, nothing written outside the root (edge). Tokens only and no `style` prop (tokens-only test); no `outline` or `--stage-*` (unit 7); `model.ts` decisions, memoized ticks (review); chunk at most 8 KB gzip.
- [ ] PR captures, none committed: 390 and 1280 px, museum light and dark, `?era=1980s`, `?era=1990s`, reduced motion, forced colors (`emulateMedia({ forcedColors: 'active' })`).
- [ ] Nothing outside Allowed paths, no dependency; `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green; `pnpm exec playwright test --project=pages` green three runs in a row; edge spec green.

## Verification steps
- `pnpm dev` → `/dev/timeline-scrubber?era=1980s&theme=dark`, `/dev/timeline-scrubber-late`; `pnpm test`; `pnpm exec playwright test --project=pages` three times (first: `pnpm exec playwright install chromium`).
- `PLCMUSEUM_E2E_FIXTURES=1 pnpm build && pnpm exec playwright test --project=edge` (PowerShell: `$env:PLCMUSEUM_E2E_FIXTURES = '1'; pnpm build; Remove-Item Env:PLCMUSEUM_E2E_FIXTURES; pnpm exec playwright test --project=edge`). Only that build keeps the island in `dist/`; chunk: `node -e "const fs=require('node:fs'),z=require('node:zlib');for(const f of fs.readdirSync('dist/_astro'))if(/^TimelineScrubber\..*\.js$/.test(f))console.log(f,z.gzipSync(fs.readFileSync('dist/_astro/'+f)).length)"`.
- Manual (the architect runs what you cannot): NVDA or VoiceOver reads caption and value per step, nothing after the settle; TalkBack with Chrome or VoiceOver with iOS Safari: one swipe, one exhibit spoken, one stage move, focus stays; iOS Safari: a track tap picks the nearest tick, a drag commits on release; Firefox and desktop Safari: native track-click jump or not, drag, keys; DevTools device mode: touch drag, tap, a vertical swipe on the scrubber scrolls and picks nothing; the drag task; OS reduced motion; forced colors.
- Record every manual check (device, OS, browser versions), the longest drag task, the chunk size and whether Firefox and desktop Safari jump the thumb natively in Implementation notes; name the checks you could not run.
- PR #9 lessons: `pages.spec.ts` and `coverflow.spec.ts` stay green; a test that races a timer or skips its path is not done; await every navigation; prove deferred paths through recorded state.

## Questions (implementer → architect)

## Implementation notes (implementer)

## Review (Claude Code)
