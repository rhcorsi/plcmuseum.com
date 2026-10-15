# ADR-0012: Preferences applied before first paint

Status: accepted by the owner, 2026-10-15 (option b), and implemented the same day.

## Context

ADR-0011 builds EraToggle and LanguageSwitch as module scripts, which run after the parser. On their own, they apply the stored era after first paint (a visitor with Era UI on sees the museum theme, then the page reflows into the era theme, on every page view), and the remembered language replaces a home that has already been shown, which a screen reader may have started to read.

## Options

- **(a) Nothing**: accept both.
- **(b) A render-blocking, classic, same-origin `/prefs.js`** loaded in `<head>`, ending it in the built pages (after Astro's CSP meta and the stylesheets; see Implementation).
- **(c) An inline script hashed at build time**: an author inline script, which docs/SECURITY.md 3.1 forbids, and one more hash in every CSP header.

## Decision

Option (b). `/prefs.js` runs before anything paints and only reads localStorage:

- on a language home (`/<lang>/`) reached through a same-origin redirect (Navigation Timing `type: 'navigate'`, `redirectCount > 0`), when `STORAGE_KEYS.lang` holds another of the five languages, it stops the parser and replaces the page with that language's home, keeping query and fragment;
- otherwise, when `STORAGE_KEYS.eraUi` is "1", it sets `html[data-era]` to `html[data-page-era]` if that is one of the five eras;
- any failure (storage blocked, no timing) leaves the museum theme and the language the page was served in.

## Consequences

- One small request per page view, fetched in parallel with the stylesheets (once the script ends `<head>`), which block rendering anyway. Its own budget: at most 1 KB gzip.
- No CSP change: `script-src 'self'` allows it. `<script is:inline src="/prefs.js">` passes `astro/no-unsafe-inline-scripts` because it has `src`, and Astro emits no hash for it (`csp.json` keeps its 7 script hashes).
- The follow rule lives only in `/prefs.js`: the LanguageSwitch module of TASK-005 stores plain clicks and nothing else. EraToggle initializes from storage and finds `html[data-era]` already applied, so it starts without a museum-first flash or a reflow.
- `/prefs.js` is outside the bundle, so it repeats the storage keys, the five eras and the five languages as literals. A change to any of them now touches `src/islands/contracts.ts`, `src/lib/era.ts` or `src/i18n/langs.ts` and `public/prefs.js` together; the parity test fails until they agree.
- `ERA_HOOKS.applied` and `STORAGE_KEYS` name `/prefs.js` as the second writer of `data-era` and the before-paint reader of both keys; docs/SECURITY.md 3.1 lists the script.

## Implementation (2026-10-15)

- `public/prefs.js`, written by `src/layouts/Base.astro` near the top of `<head>` (so `astro dev` runs it too) and moved by the build to the end of `<head>` (`placePrefsScriptLast` in astro.config.mjs). Astro injects its CSP meta (ADR-0010) and the stylesheet links at the end of `<head>`, and Chromium's preload scanner holds back every request after a CSP meta until the parser has read it: with the script in front, the stylesheets started only after `/prefs.js` had downloaded and run, one extra round trip before first paint on every page view (review measurement under Slow 4G: cold first contentful paint on `/en/about` 1692 ms as first written, about 1140 ms without the script). At the end of `<head>` the script waits for the stylesheets, which rendering waits for anyway, and still runs before first paint. The build fails if a page lacks the script or has it twice.
- Beyond the proposed outline, the script calls `window.stop()` before `location.replace()`: the redirected home never gets a body, so in any browser it neither paints nor reaches a screen reader while the remembered home loads. Chromium already stops parsing there on its own (observed under Playwright); the call makes it explicit everywhere.
- `tests/islands/prefs-head.test.ts` runs the file against stubs of the four browser globals it reads: the keys, eras and languages agree with the source modules, the follow rule holds (stop, then replace, only on a redirected language home and only for a supported, different language), storage failures are silent, and the gzip size stays at most 1 KB (833 bytes when accepted). TASK-005's edge budget test counts module scripts only.
- `tests/e2e/prefs.edge.spec.ts` (project `edge`, Chromium under `wrangler dev`): `/prefs.js` ends `<head>`, classic, after the CSP meta and every stylesheet, on a decade page, the home, a static page and a 404 page; the first animation frame of a decade page already wears the stored era (and the museum theme without it); a remembered language replaces the home the `/` redirect chose, that home never gets a body, and Back skips it.
- `eslint.config.js` lints `public/**/*.js` as classic browser scripts, with the browser globals listed by hand.
- Tested in Chromium only (the Playwright browser this project installs). Firefox and WebKit report `type` and `redirectCount` of Navigation Timing and honour `window.stop()` per the specs, but that is not verified here; check both before the first production deploy (docs/private/PLAN.md).
- Follow-up: `/prefs.js` keeps the assets binding default `Cache-Control: public, max-age=0, must-revalidate`, so a repeat view revalidates it (a 304) before first paint, in parallel with the stylesheets, which are revalidated the same way today. When the content-hashed `/_astro/` files get long-lived caching, serve this script from a hashed URL too.
