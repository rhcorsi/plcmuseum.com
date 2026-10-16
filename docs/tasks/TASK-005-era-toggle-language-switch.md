status: ready
id: TASK-005
title: EraToggle and LanguageSwitch header controls (script components, no React)
assignee: codex
branch: feat/task-005-era-toggle-language-switch
depends_on: []
created: 2026-10-15

## Goal
Every page on the `Page` layout gets an "Era style" switch ending the header's top row. On, the museum wears the era on screen: the exhibit's, the decade's, or on the home the centered exhibit's (the first one until CoverFlow, TASK-001, is integrated); pages without an era stay museum, and turning it on there says where it applies. Off, every page is museum. The choice is remembered on this device, as is a plain click on a language link (still a plain link), which `/prefs.js` (ADR-0012) then follows. No React: both controls add at most 3.5 KB gzip of JS.

## Contract
**Before you start.** ADR-0011 (1b, 2b) and ADR-0012 (b) are accepted and land on main with the architect's contract PR. Stop and ask in Questions unless your base has `ERA_HOOKS`, `ERA_TOGGLE_HOOKS` and `LANGUAGE_HOOKS` in `src/islands/contracts.ts` (the source of truth: read its comments), `era.toggle` in `src/i18n/en.json`, and `public/prefs.js` in the `<head>` of `Base.astro`. On main:
- `<html data-era="museum">` (`ERA_HOOKS.applied`) and, where a page has an era, `data-page-era` (`ERA_HOOKS.page`): the exhibit's era (`era_theme_override` included), `eraForDecade(decade)` on every decade page, the first exhibit's era on the home.
- `/prefs.js` (architect-owned, classic, render-blocking) runs before first paint: with `STORAGE_KEYS.eraUi` `"1"` it copies a valid `data-page-era` into `data-era`. On the language home the Worker's `/` redirect chose (`/<lang>/?auto`; `/en` to `/en/` and every other link keep their language) it removes the marker from the address bar, and while `STORAGE_KEYS.lang` holds another of the five languages it stops the parser and replaces the page with that home (fragment kept, era skipped): that home never gets a body, so wait for the target's nav `data-ready`, never `load`.
- TypeScript and Astro markup use the hook constants (`class={ERA_TOGGLE_HOOKS.root}`, as StageList uses `STAGE_HOOKS`); CSS may use the literal class.

Intended departures from AGENTS.md and docs/DESIGN_SYSTEM.md section 7: one fixture page per era (`src/pages/dev/era-toggle/[scenario].astro`) without `FixtureSwitches`, `?era=` or `src/fixtures/` data; LanguageSwitch tested on real pages.

**Shape (ADR-0011).** Each control is an Astro component plus TypeScript modules in its own folder, loaded by one `<script src="../islands/era-toggle/main.ts"></script>` after the component's root (`../islands/language-switch/main.ts` in `LanguageLinks.astro`), no other attribute, empty body; never `<script>import ...</script>` (it fails `astro/no-unsafe-inline-scripts`). Astro bundles it into a same-origin `/_astro/` file under `script-src 'self'`: no hash, no `client:*`, no `csp.json` change. Only `main.ts` has side effects at import. Client code imports only `src/islands/contracts.ts`, `src/lib/era.ts`, `src/i18n/langs.ts` and its own folder (type-only imports too), never `src/i18n/utils.ts`, a dictionary (that ships all five) or React; the components' frontmatter runs at build time and may.

**EraToggle** (`src/components/EraToggle.astro`, props `EraToggleProps` = `{ lang: Lang }`, client code in `src/islands/era-toggle/`), rendered by `Header.astro` as the last rendered child of `.top` (followed only by its own module script, which Astro emits where the `<script src>` is written), after `LanguageLinks`. Exactly this markup (tests use the classes):

```html
<div class="era-toggle"
     data-announce-off="..." data-announce-no-era="..."
     data-announce-1970s="..." data-announce-1980s="..." data-announce-1990s="..."
     data-announce-2000s="..." data-announce-2020s="...">
  <button type="button" class="era-toggle__button" role="switch" aria-checked="false">
    <span class="era-toggle__label">Era style</span>
    <span class="era-toggle__track" aria-hidden="true"><span class="era-toggle__thumb"></span></span>
  </button>
  <span class="era-toggle__status sr-only" aria-live="polite" aria-atomic="true"></span>
</div>
```

- `data-announce-off` is `era.announce_off`, `data-announce-no-era` is `era.announce_on_no_era`, `data-announce-<era>` is `t(lang, 'era.announce_on', { decade: t(lang, 'decade.<era>') })` per era; the script reads them with `getAttribute` and never formats them (no `<template>`).
- The button is named by its label alone and rendered off. The status (the live region) is outside the button, empty in the server HTML, hidden with Tailwind `sr-only` (never `display: none`, `hidden` or `visibility: hidden`). No `aria-label`, `aria-labelledby`, `aria-describedby`, `aria-pressed`, `title` or `tabindex` anywhere.
- The script changes only `aria-checked`, the status `textContent`, and the root's empty `data-ready` (`ERA_TOGGLE_HOOKS.ready`, after init) and `data-animate`; never `style`.
- Until `data-ready`, `.era-toggle:not([data-ready]) .era-toggle__button` is `visibility: hidden` (box kept, not focusable or announced; the status stays in the accessibility tree). Under `@media (scripting: none)` the root is `display: none`.

State:
- `enabled`: `STORAGE_KEYS.eraUi` is `"1"`; anything else is off. On stores `"1"`, off removes the key. Every access, `window.localStorage` included, is in try/catch: a failed read is off at init and no change on `pageshow`; a failed write is ignored (the switch still works for the page).
- `pageEra`: `html[data-page-era]` at init, valid only in `ERA_THEMES`. `centeredEra`: the era of the last `CENTER_CHANGE_EVENT` whose `detail?.era` is in `ERA_THEMES`; nothing else of the detail is read, and anything invalid is ignored without throwing.
- Applied era: off, `museum`; on, `centeredEra`, else `pageEra`, else `museum`. `/prefs.js` normally applied it before init; never assume so. Never write `data-page-era` or `data-theme`, remove `data-era`, or read the stage markup.
- The only listeners, attached once at init: `click` on the button, `CENTER_CHANGE_EVENT` on `document` (in both states), `pageshow` on `window`. No `await`, microtask, `requestAnimationFrame` or timer anywhere: all work is synchronous.

Order of operations (the tests rely on it). "Write": set `html[data-era]` to the applied era only if it differs. "Dispatch": `ERA_CHANGE_EVENT` with `{ enabled, era }` on `document`, right after the write, so a listener reads `html[data-era] === detail.era`.
- Init: read storage and `data-page-era` → write → `aria-checked` → dispatch (always) → `data-ready`. Status untouched.
- Click (Space and Enter too, natively): set `data-animate` → flip `enabled` → store → write → `aria-checked` → dispatch → status: `data-announce-<era>` when on with an era, `data-announce-no-era` when on without one, `data-announce-off` when off.
- Valid `CENTER_CHANGE_EVENT`: record `centeredEra`; only when on and the applied era changes: write → dispatch → status `""`. Otherwise no event, status untouched.
- `pageshow` with `persisted: true`: read storage; stop if that failed or `enabled` is unchanged; else remove `data-animate` → set `enabled` → write → `aria-checked` → dispatch → status `""`. No store. `persisted: false`: nothing.

A cleared status is not spoken. The script never calls `focus()` or `blur()`: focus stays on the switch even when the era reflows the header. The focus ring is the global `:focus-visible` outline in `--color-focus`, not restyled.

**LanguageSwitch** (`src/components/LanguageLinks.astro` plus `src/islands/language-switch/`). The `<nav>` gets the class `LANGUAGE_HOOKS.nav` next to `languages`, each `<a>` gets `data-lang="<Lang>"`, and nothing else in the markup changes (no ARIA, nothing announced, links work without JS). One delegated `click` listener on the nav, then `data-ready` on it. It writes the link's `Lang` to `STORAGE_KEYS.lang` synchronously, in try/catch, without `preventDefault`, only if `event.button === 0`, no `ctrlKey`, `metaKey`, `shiftKey` or `altKey`, not `defaultPrevented`, and the target is in an `a[data-lang]` of this nav: plain clicks (the current language too), Enter and assistive-technology activation; never middle clicks (`auxclick`), modifier clicks or context menus. It never reads the stored value or navigates (`/prefs.js` follows).

**CSP.** No `style="..."`, `style` writes, inline `<script>`, `on*` attributes or `innerHTML`; the thumb moves through selectors such as `.era-toggle__button[aria-checked='true'] .era-toggle__thumb`.

**Modules.** Pure modules touch no `window`, `document`, `location`, `performance` or `localStorage`; storage arrives as a getter, `() => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`, that may itself throw. Suggested: `era-toggle/state.ts` (`parseEra`, `readEnabled` with null on failure, `writeEnabled`, `resolveEra({ enabled, centeredEra, pageEra })`, the message per cause), `language-switch/remember.ts` (`rememberLanguage(getStorage, value)`, writing only a `Lang`), and a `main.ts` per folder for the DOM wiring.

## Fixtures
- `src/pages/dev/era-toggle/[scenario].astro` (new), for `none` and each era: `<Page lang="en" title={'EraToggle fixture: ' + scenario} path={null} noindex pageEra={scenario === 'none' ? null : scenario}>` with an `h1`, a paragraph, `<a id="fixture-link" href="#fixture-box">Fixture link</a>` and a `<div id="fixture-box">` drawn with `--color-surface`, `--color-border`, `--border-width`, `--radius-md` (literal English). No `FixtureSwitches`: it writes `data-era`.
- Stage changes: `document.dispatchEvent(new CustomEvent(CENTER_CHANGE_EVENT, { detail }))`, with "the 1990s detail" `{ id: 'fx-bevel-station-bs95', decade: '1990s', era: '1990s' }` and "the 1970s detail" `{ id: 'fx-relay-replacer-r1', decade: '1960s', era: '1970s' }`. No CoverFlow, no dev control that dispatches.
- Real pages: `/<lang>/about`, `/<lang>/decades/<decade>`. Specs import only `contracts.ts`, `era.ts` and `langs.ts`, and import `src/i18n/<lang>.json` as JSON modules (`resolveJsonModule` is on). `pnpm typecheck` checks the specs and the project has no Node types, so no `.ts` file imports a `node:` module; never `src/fixtures/exhibits.ts` (its `?url` import breaks Playwright's loader).

## Allowed paths
- `src/components/EraToggle.astro`, `src/islands/era-toggle/**`, `src/islands/language-switch/**`, `src/pages/dev/era-toggle/[scenario].astro`
- `src/components/LanguageLinks.astro` (hook class, `data-lang`, script tag, leading comment) and `src/components/Header.astro` (import and render `EraToggle`, leading comment); nothing else in either
- `tests/islands/era-toggle.test.ts`, `tests/islands/language-switch.test.ts`, `tests/e2e/era-toggle.spec.ts`, `tests/e2e/language-switch.spec.ts`, `tests/e2e/header-controls.edge.spec.ts`, `tests/e2e/helpers/header-controls.ts`
- this file (Questions, Implementation notes)

Anything else needs an approval recorded in the PR conversation. Captures go in the PR, never in git.

## Out of scope
Architect-owned: `public/prefs.js`, `tests/islands/prefs-head.test.ts`, `tests/e2e/prefs.edge.spec.ts`, `<head>`, `Base.astro`, `Page.astro`, the pages and their `pageEra`, `contracts.ts`, the dictionaries, `tests/styles/**` and the other specs. Also the Worker, cookies, `csp.json`, the Astro, Playwright and ESLint configs, other tasks' files, `LanguageChooser.astro`, following the stored language, tab sync, a remembered-language hint or forget control, and React.

## Requirements
- Accessibility: the WAI-ARIA switch of Contract; Tab reaches it right after the last language link; Space and Enter work natively (no key handlers).
- Button: `display: inline-flex`, `align-items: center`, `gap: var(--space-2)`, `min-block-size: 2.75rem`, `padding-inline: var(--space-2)`, `border-radius: var(--radius-sm)`, `font-family: var(--font-body)`, `font-size: var(--text-sm)` (at least 44 × 44 px); hover `background: var(--color-surface-hover)`. The label wraps: no `white-space: nowrap`, no fixed inline size; root and button `min-inline-size: 0`, `max-inline-size: 100%`; track `flex-shrink: 0`.
- Track: `inline-size: calc(var(--space-4) * 2 + var(--space-1) * 2 + var(--border-width) * 2)`, `block-size: calc(var(--space-4) + var(--space-1) * 2 + var(--border-width) * 2)`, `padding: var(--space-1)`, `border: var(--border-width) solid`, `border-radius: var(--radius-lg)`. Thumb: `display: block`, `inline-size` and `block-size` `var(--space-4)`, `border: var(--border-width) solid`, `border-radius: var(--radius-md)`; off `transform: none`, on `translateX(100%)` (the inline end; pages are `dir="ltr"`). Never `50%`, `999px` or a literal radius, color or duration; the only literal lengths are the prescribed `2.75rem`, `100%` and `0`.
- Colors, off / on: label `--color-text`; track border `--color-text-muted` / `--color-text`; track fill `--color-surface` / `--color-accent`; thumb fill and border `--color-text-muted` / `--color-accent-contrast`. These are the pairs `tests/styles/tokens.test.ts` guarantees in every theme and scheme, with the focus ring on `--color-bg-elevated`; use no others. Position, not color, shows the state.
- Reduced motion: `.era-toggle[data-animate] .era-toggle__thumb { transition: transform var(--motion-fast) var(--motion-ease); }`, `transition: none` under `prefers-reduced-motion: reduce`. Not gated on `data-ready`, which would animate the stored state at init. Init, resync and the era change itself are instant.
- Performance: no React chunk on a page without a React island; module scripts of `dist/en/about.html` with their static imports at most 3584 bytes gzip, EraToggle at most 2048 and LanguageSwitch at most 1536 (edge 4); no dynamic `import()`; `/prefs.js` has its own budget. Known cost (ADR-0011), not yours: a stage-driven era change falls outside CLS's 500 ms input window.
- Era themes: all five plus museum; shape from tokens only (radius 0 in the 1980s and 1990s themes squares it); tests compare with tokens resolved in the page.
- i18n: copy only from `src/i18n`; add no key (ask in Questions); LanguageSwitch adds none. Keys, on main in all five dictionaries: `era.toggle` (en "Era style"), `era.announce_on` (`{decade}` is `decade.<era>`), `era.announce_on_no_era`, `era.announce_off`.

### Tests
Vitest runs in node with no DOM library (adding one needs the owner's approval); DOM behavior goes to Playwright. Wait for `[data-ready]`, an attribute or a recorded event (`expect.poll`), never `waitForTimeout` or frames; read a dispatch's effects in the same `page.evaluate`. Every negative check gets a positive sentinel in the same test. Each test fails on the regression it guards.

Helpers (`tests/e2e/helpers/header-controls.ts`): error tracking as in `pages.spec.ts`; seeding by `page.evaluate` and reload (`localStorage` throws on `about:blank`, so not in an init script); failing-storage init scripts, (a) the `window.localStorage` getter throws a `SecurityError`, (b) the `Storage.prototype` methods throw; "`/prefs.js` stubbed": `page.route` on both `**/prefs.js` (`astro dev`) and `**/_astro/prefs.*.js` (the hashed production URL), fulfilled with status 200, `text/javascript` and a body that only sets a window flag, so every stubbed document can assert that the stub ran (no error logged, unlike `abort()`); an init-script recorder, given `ERA_CHANGE_EVENT` as argument, of every `ERA_CHANGE_EVENT` detail with `data-era` and the root's `data-ready` read in the listener, of the records of a `MutationObserver` on `document` (`documentElement` does not exist yet when init scripts run) with `{ subtree: true, attributeFilter: ['data-era'] }` whose target is `<html>` (same-value writes included, so the write `/prefs.js` makes during head parsing counts), and of every `transitionrun` on `.era-toggle__thumb` with its `propertyName`; a token probe on a temporary element (durations in ms).

Unit: `resolveEra` over every `enabled` × `centeredEra` (none, an era) × `pageEra` (none, another era); `readEnabled` (`"1"` true; `null`, `"0"`, `"true"`, `""`, `"on"` false; null when the getter or `getItem` throws); `writeEnabled` (on `setItem(eraUi, "1")`, off `removeItem` only); `parseEra` (each era in; `'museum'`, `'1960s'`, `'2010s'`, `''`, `null`, `undefined`, `42` out); the message per cause (click on with an era: `data-announce-<era>`; on without one: `data-announce-no-era`; off: `data-announce-off`; cleared by a valid stage event while on with a new era and by a persisted `pageshow` that changes the state; the cases that leave the status untouched (init, a stage event while on with the same era or while off, an invalid detail, a persisted `pageshow` with no change or a failed read, and a non-persisted `pageshow`) are covered by e2e 3, 4 and 6, not by unit tests); `rememberLanguage` (each `Lang` written; `'xx'`, `''`, `null` ignored; never `getItem` on a stub that records calls); no throw escapes. Each file also reads every `.ts` file in its folder as text (every import form, relative specifiers resolved, extensionless as `.ts`): only the four allowed targets, no bare specifier. In the component it checks only the `<script>` tags: exactly one, whose only attribute is `src="../islands/<folder>/main.ts"`, with an empty body (the frontmatter may import `src/i18n/utils.ts`). It must find the tag and two or more modules, and reject probes importing `react` and `../../i18n/utils`. The language-switch file also finds no `getItem`, `location`, `performance` or `history` (whole words, comments included) in its folder's `.ts` files, and rejects a probe using `location`.

`tests/e2e/era-toggle.spec.ts` (project `pages`, `/dev/era-toggle/1980s` unless noted):
1. Markup: one `getByRole('switch')`, the `button[type=button].era-toggle__button`, named exactly the en `era.toggle`; `.site-header .top > .era-toggle` has count 1 and `.site-header .top > :not(script)` (`.last()`) has class `era-toggle`; each element's `role`, `tabindex`, `title` and `aria-*` equal the Contract markup; the status is outside the button, empty, not `display: none`, `visibility: visible`; the `data-announce-*` equal the en strings; `data-era` `museum`, `data-page-era` `1980s`.
2. `reducedMotion: 'reduce'`: Tab from "Italiano" reaches the switch; Space, Enter and a click each turn it on and off, keeping focus and name, with `aria-checked`, `data-era`, storage (`"1"` or absent) and the thumb's x (greater on) right each time.
3. Announcements, one sequence: `""` after init; click: the 1980s `era.announce_on`; the 1990s detail: `1990s`, `""`, no added text (status observer in the same evaluate); click: `era.announce_off`; the 1970s detail while off: nothing; click: `1970s` and its message; on `none`, a click: `museum` and `era.announce_on_no_era`.
4. Stage events: details with `era` `'museum'`, `'1960s'` or missing, and no detail, off and then on: no change, error or event (after the off round a click on gives `1980s`; after the on round the 1990s detail gives `1990s` and one event when `dispatchEvent` returns). The synthetic `{ id: 'fx-octal-rack-or5', decade: '1980s', era: '2000s' }`, shaped like an `era_theme_override` exhibit, gives `2000s`; the same era again, no event; an era centered while off beats the page era at the next click on; a new era leaves focus on a focused `#fixture-link`.
5. Writes: storage empty, one initial `{ enabled: false, era: 'museum' }` before `data-ready` and no record; each click, one event (`detail.era` equal to `data-era` in the listener) and one record. `"1"` seeded: initial `{ enabled: true, era: '1980s' }` and one record (by `/prefs.js`), still one with `/prefs.js` stubbed (by the toggle). On `none`, a click on: one event, no record. Off, a stage event: no event.
6. Persistence: on survives a reload (focus on `body`), also with `/prefs.js` stubbed (`aria-checked="true"`, `1980s`), and `/dev/era-toggle/none` (`museum`); `"0"`, `"true"`, `""`, `"on"` read as off. Sequence: seed `"1"`, click off, write `"1"`; `pageshow` with `persisted: false`: nothing; `#fixture-link` focused, `persisted: true`: on, one event, `""` with no added text, focus kept; again: no event; key removed, `persisted: true`: off, one event.
7. Each failing-storage variant: no error through two clicks and a reload; the clicks work; off after the reload.
8. No shift (off): `page.route('**/src/islands/era-toggle/**')` holds requests until released; `goto` with `waitUntil: 'commit'`; once `footer.site-footer` is attached and `--color-bg` resolves, the root lacks `data-ready`, the button is `visibility: hidden`, and its rect and the `.site-header` height equal those after release and `data-ready`. A buffered `layout-shift` `PerformanceObserver` from an init script, drained with `takeRecords()`, has no source node in `.site-header` (`getEntriesByType` stays empty in Chromium). Fails with `hidden` or `display: none` before init.
9. Motion (`reducedMotion: 'no-preference'` set explicitly, `"1"` seeded, the module held as in 8 until the thumb's `transform` is read): one click after `data-ready` makes exactly one `transitionrun`, `propertyName` `transform`; the thumb's computed `transition-property` is `transform` and its `transition-duration`, in ms, equals the probe-resolved `--motion-fast` (never time the transition); a persisted `pageshow` turning it on, then a click, makes two in total; under `reduce`, 0 ms.
10. Focus ring, off and on: `outline-style: solid`, `outline-color` the resolved `--color-focus`.
11. Each `/<lang>/about`: `.site-header .top > .era-toggle` has count 1 and `.site-header .top > :not(script)` (`.last()`) has class `era-toggle`; no horizontal overflow at 320 × 800 (`scrollWidth <= clientWidth`), the localized name; at 390 × 800 a box of at least 44 × 44, also after `Page.setFontSizes` (`standard: 32`) through CDP before navigating, still without overflow. Overflow from outside Allowed paths goes to Questions with a capture.
12. `javaScriptEnabled: false`, here and on `/en/about`: the root is `display: none`, `boundingBox()` null, no `switch` in the header's `ariaSnapshot()`. Fails without the `(scripting: none)` rule; if Chromium ignores that query, ask rather than weaken.
13. Each era page and `none`, with `colorScheme` `'light'` and `'dark'` (the fixture has no theme switch): a click on gives `aria-checked="true"` and the scenario's `data-era` (`museum` on `none`); track and thumb `border-top-left-radius` equal the resolved `--radius-lg` and `--radius-md`.
14. `emulateMedia({ forcedColors: 'active' })`, off and on: thumb and track `border-top-style` not `none`, and the thumb's `border-top-width` at least 1px.

`tests/e2e/language-switch.spec.ts` (project `pages`):
1. `/en/about`: one `nav.languages.language-switch`; five `a[data-lang]` in `LANGS` order with `href` `/<lang>/about`, `hreflang` and `lang` from `LANG_TAGS`; one `aria-current="page"`, on `en`; no `[aria-live]`. `/dev/era-toggle/none`: hrefs `/<lang>/`, `aria-current="true"` on `en`.
2. Middle, `ControlOrMeta` and `Shift` clicks on "Português" store nothing (close what they open); a plain click on "English" stays on `/en/about` and stores `en`; a plain click on "Português" then lands on `/pt/about` storing `pt`, and Enter on "Deutsch" there stores `de`.
3. Each failing-storage variant: the plain click still lands on `/pt/about`, without errors.
4. Without JS, the click lands on `/pt/about`.

`tests/e2e/header-controls.edge.spec.ts` (project `edge`; build with `PLCMUSEUM_E2E_FIXTURES=1 pnpm build`):
1. `/en/decades/1980s`: no console or page error through both `data-ready`s, a click on, a reload and a click off; on (also after the reload) `data-era` equals `data-page-era` (`1980s`), off `museum`.
2. Raw HTML (`request.get`, `maxRedirects: 0`, 200): the `<header class="site-header">` segment of `/en/decades/1980s` has no `/\sstyle\s*=/i`, no `<script` without `src`, no `/\son[a-z]+\s*=/i`; `/en/about` has no `<script` without `src` and a `script[type=module]` under `/_astro/`.
3. `locale: 'en-US'`, a fresh context: `/` ends on `/en/`; a plain click on "Português" from `/en/about`; then `/` ends on `/pt/` (`goto` with `waitUntil: 'commit'`, then the nav's `data-ready`).
4. Budget, over HTTP from the edge server (no `node:` imports, see Fixtures): every `script[type=module][src]` and `link[rel=modulepreload]` of `/en/about` plus their static imports, fetched with `request.get`, recursively; any `import(` fails; each file gzipped with `CompressionStream('gzip')` as `tests/islands/prefs-head.test.ts` does; total at most 3584 bytes. Grouped by entry (the module script that is the next element sibling of `.era-toggle`, and of `nav.language-switch`; a shared chunk counts in both): at most 2048 and 1536 bytes. Print a table (file, entry, raw, gzip) for the PR.

## Acceptance criteria
- [ ] Unit, era-toggle (1 to 14), language-switch (1 to 4) and edge (1 to 4) tests pass: the switch is the last rendered element of the header's top row (e2e 1 and 11); markup, ARIA, focus, announcements, writes and events follow Contract; the initial state and attribute writes hold with and without `/prefs.js` (e2e 5 and 6); storage failures raise no error; LanguageSwitch stores plain clicks only, never reads the stored value, and `/prefs.js` follows it; the edge 4 budgets hold.
- [ ] e2e 8 and 12 shown to fail on their regressions by a temporary revert (Implementation notes).
- [ ] Tokens only: `tests/styles/tokens-only.test.ts` green (colors, fonts, style attributes); radius and duration verified by e2e 13 and 9; other literals are a review check; `csp.json` unchanged.
- [ ] The PR shows the edge 4 table and captures (none committed): 390 and 1280 px, off, on per era, dark for off and `1980s` (museum only, said so, if TASK-002 is not on main).
- [ ] Only Allowed paths changed; `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green; the two `pages` specs green three runs in a row; `pnpm exec playwright test --project=pages` green, and `--project=edge` after `PLCMUSEUM_E2E_FIXTURES=1 pnpm build`.

## Verification steps
- The commands of the last acceptance criterion, after `pnpm exec playwright install chromium` the first time; report each of the three `pages` spec runs.
- `pnpm dev`: `/dev/era-toggle/1980s`, `/dev/era-toggle/none`, `/pt/decades/1990s`, `/de/about` by keyboard, then with NVDA and Chrome or VoiceOver and Safari: name (the page language's `era.toggle`), switch or toggle-button role and state; on activation the new state, then the message once; nothing on load, on a console-dispatched stage event, or on back/forward.
- DevTools Rendering: `forced-colors: active` and `prefers-reduced-motion: reduce`; the thumb stays visible and moves instantly.
- Architect, at integration: OS-level reduced motion; Lighthouse mobile on `/en/` and an exhibit page.

## Questions (implementer → architect)

## Implementation notes (implementer)

### 2026-10-15: header controls handback

- Started in a separate worktree, on `feat/task-005-era-toggle-language-switch` from `origin/main` (`77c900c`), after pushing TASK-001 round 2 (`1bb436b`) to PR #9. TASK-004 was not started.
- Added the exact server-rendered EraToggle markup as the last rendered child of the header's top row, with localized data attributes and an initially empty status outside the switch. Token-only CSS reserves the button's box before initialization, hides the root without scripting, preserves native focus, and animates only visitor toggles, with an instant reduced-motion variant.
- The synchronous EraToggle module reads the remembered preference defensively, applies the last valid centered era or the page era, writes only changed `data-era` values, and emits the contract event after applying state. Initialization is silent; center changes and persisted `pageshow` resyncs clear status only when effective state changes. Storage getter and method failures stay contained, including failed reads on resync.
- LanguageLinks keeps its existing links and ARIA. Its delegated listener remembers only plain activations, including the current language and keyboard activation, without reading preferences, preventing navigation, or implementing the `/prefs.js` follow rule. Neither control imports React or a dictionary on the client.
- Added the six scenario fixture pages and 144 unit cases for state, storage, announcement policy and every import form. The source guards parse TypeScript, resolve relative paths, check every module in each folder, require the exact external script tags, and reject forbidden import and navigation probes. JSON imports in Playwright use `with { type: 'json' }`; no TypeScript test imports a Node module.
- Verification: `pnpm lint` passed; `pnpm typecheck` passed with 93 files and zero errors, warnings or hints; `pnpm test` passed 628 tests in 23 files; normal `pnpm build` passed (75 generated routes, 67 after dev removal). `PLCMUSEUM_E2E_FIXTURES=1 pnpm build` passed (76 generated routes, 68 after dev removal).
- The two task `pages` specs passed three consecutive runs, without retries or code edits between them: **65/65 (35.1 s), 65/65 (31.8 s), 65/65 (30.5 s)**. The full `pages` project then passed **98/98 (43.0 s)** and the full `edge` project passed **33/33 (19.9 s)**.
- Local Playwright used an ignored temporary config under `test-results/`, with this worktree as server cwd, isolated ports 14321 and 18787, and `reuseExistingServer: false`. Other worktrees were using the standard ports, and the first alternative port 15321 was in a Windows reserved range. The checked-in configuration is unchanged. Logs are `test-results/task005-pages-{1,2,3}.log`, `task005-pages-full.log` and `task005-edge-full.log`.
- Mutation proof for e2e 8: temporarily replacing pre-init `visibility: hidden` with `display: none` made the test fail on the reserved-button assertion. Mutation proof for e2e 12: temporarily removing the `scripting: none` rule made both fixture and real-page cases fail because the root remained `display: block`. Both changes were restored before the three final runs; logs are `test-results/task005-mutation-pre-init-box.log` and `task005-mutation-no-script.log`.

The edge test fetched every module script, module preload and static dependency over HTTP, rejected dynamic imports, and measured each file with `CompressionStream('gzip')`. Shared modules count in both per-control totals and once in the combined total:

| File under `/_astro/` | Entry | Raw bytes | Gzip bytes |
| --- | --- | ---: | ---: |
| `LanguageLinks.astro_astro_type_script_index_0_lang.z-RntXPy.js` | LanguageSwitch | 531 | 376 |
| `contracts.30odnZO8.js` | LanguageSwitch, EraToggle | 290 | 177 |
| `EraToggle.astro_astro_type_script_index_0_lang.B7q5VCNb.js` | EraToggle | 1569 | 750 |
| `era.CPrI5Rmy.js` | EraToggle | 137 | 125 |

- Combined: **1428 / 3584 bytes gzip**. EraToggle: **1052 / 2048**. LanguageSwitch: **553 / 1536**. No React chunk, dependency, CSP configuration or other architect-owned file changed.
- Sixteen captures from final run 3: 390 and 1280 px, off and all five eras in light mode, off and 1980s in dark mode. They show the header and fixture, excluding the footer's contact details. The captures were kept outside the repository and inspected by the architect; they are not committed. TASK-002 is not on this base, so all era states intentionally use the museum tokens.
- Keyboard, accessibility-tree state, focus, forced colors and reduced-motion emulation passed in Chromium. NVDA/Chrome or VoiceOver/Safari speech, OS-level reduced motion, and integration Lighthouse checks were not performed here and remain for the architect's manual verification. No merge or deployment was performed.

## Review (Claude Code)
