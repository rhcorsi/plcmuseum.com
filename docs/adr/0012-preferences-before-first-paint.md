# ADR-0012: Preferences applied before first paint

Status: accepted by the owner, 2026-10-15 (option b), and implemented the same day.

## Context

ADR-0011 builds EraToggle and LanguageSwitch as module scripts, which run after the parser. On their own, they apply the stored era after first paint (a visitor with Era UI on sees the museum theme, then the page reflows into the era theme, on every page view), and the remembered language replaces a home that has already been shown, which a screen reader may have started to read.

## Options

- **(a) Nothing**: accept both.
- **(b) A render-blocking, classic, same-origin `/prefs.js`** loaded in `<head>` right after the viewport meta, before the stylesheet.
- **(c) An inline script hashed at build time**: an author inline script, which docs/SECURITY.md 3.1 forbids, and one more hash in every CSP header.

## Decision

Option (b). `/prefs.js` runs before anything paints and only reads localStorage:

- on a language home (`/<lang>/`) reached through a same-origin redirect (Navigation Timing `type: 'navigate'`, `redirectCount > 0`), when `STORAGE_KEYS.lang` holds another of the five languages, it stops the parser and replaces the page with that language's home, keeping query and fragment;
- otherwise, when `STORAGE_KEYS.eraUi` is "1", it sets `html[data-era]` to `html[data-page-era]` if that is one of the five eras;
- any failure (storage blocked, no timing) leaves the museum theme and the language the page was served in.

## Consequences

- One small request per page view, fetched in parallel with the stylesheet, which blocks rendering anyway. Its own budget: at most 1 KB gzip.
- No CSP change: `script-src 'self'` allows it. `<script is:inline src="/prefs.js">` passes `astro/no-unsafe-inline-scripts` because it has `src`, and Astro emits no hash for it (`csp.json` keeps its 7 script hashes).
- The follow rule lives only in `/prefs.js`: the LanguageSwitch module of TASK-005 stores plain clicks and nothing else. EraToggle initializes from storage and finds `html[data-era]` already applied, so it starts without a museum-first flash or a reflow.
- `/prefs.js` is outside the bundle, so it repeats the storage keys, the five eras and the five languages as literals. A change to any of them now touches `src/islands/contracts.ts`, `src/lib/era.ts` or `src/i18n/langs.ts` and `public/prefs.js` together; the parity test fails until they agree.
- `ERA_HOOKS.applied` and `STORAGE_KEYS` name `/prefs.js` as the second writer of `data-era` and the before-paint reader of both keys; docs/SECURITY.md 3.1 lists the script.

## Implementation (2026-10-15)

- `public/prefs.js`, loaded by `src/layouts/Base.astro` right after the viewport meta; Astro emits the stylesheet link later in the head.
- Beyond the proposed outline, the script calls `window.stop()` before `location.replace()`: the redirected home never gets a body, so in any browser it neither paints nor reaches a screen reader while the remembered home loads. Chromium already stops parsing there on its own (observed under Playwright); the call makes it explicit everywhere.
- `tests/islands/prefs-head.test.ts` runs the file against stubs of the four browser globals it reads: the keys, eras and languages agree with the source modules, the follow rule holds (stop, then replace, only on a redirected language home and only for a supported, different language), storage failures are silent, and the gzip size stays at most 1 KB (833 bytes when accepted). TASK-005's edge budget test counts module scripts only.
- `tests/e2e/prefs.edge.spec.ts` (project `edge`, Chromium under `wrangler dev`): `/prefs.js` is the first script in `<head>`, classic and before the stylesheet; the first animation frame of a decade page already wears the stored era (and the museum theme without it); a remembered language replaces the home the `/` redirect chose, that home never gets a body, and Back skips it.
- `eslint.config.js` lints `public/**/*.js` as classic browser scripts, with the browser globals listed by hand.
