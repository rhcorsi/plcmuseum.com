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

- on a language home (`/<lang>/`) reached through a same-origin redirect (Navigation Timing `type: 'navigate'`, and `redirectCount > 0` in the entry or in the older `performance.navigation`; see Cross-browser verification), when `STORAGE_KEYS.lang` holds another of the five languages, it stops the parser and replaces the page with that language's home, keeping query and fragment;
- otherwise, when `STORAGE_KEYS.eraUi` is "1", it sets `html[data-era]` to `html[data-page-era]` if that is one of the five eras;
- any failure (storage blocked, no timing) leaves the museum theme and the language the page was served in.

## Consequences

- One small request on a first visit, fetched in parallel with the stylesheets (once the script ends `<head>`), which block rendering anyway; later page views take it from the browser cache (see Caching). Its own budget: at most 1 KB gzip.
- No CSP change: `script-src 'self'` allows it. `<script is:inline src="/prefs.js">` passes `astro/no-unsafe-inline-scripts` because it has `src`, and Astro emits no hash for it (`csp.json` keeps its 7 script hashes).
- The follow rule lives only in `/prefs.js`: the LanguageSwitch module of TASK-005 stores plain clicks and nothing else. EraToggle initializes from storage and finds `html[data-era]` already applied, so it starts without a museum-first flash or a reflow.
- `/prefs.js` is outside the bundle, so it repeats the storage keys, the five eras and the five languages as literals. A change to any of them now touches `src/islands/contracts.ts`, `src/lib/era.ts` or `src/i18n/langs.ts` and `public/prefs.js` together; the parity test fails until they agree.
- `ERA_HOOKS.applied` and `STORAGE_KEYS` name `/prefs.js` as the second writer of `data-era` and the before-paint reader of both keys; docs/SECURITY.md 3.1 lists the script.

## Implementation (2026-10-15)

- `public/prefs.js`, written by `src/layouts/Base.astro` near the top of `<head>` (so `astro dev` runs it too) and moved by the build to the end of `<head>` (`placePrefsScript` in astro.config.mjs, which also gives it its hashed name; see Caching). Astro injects its CSP meta (ADR-0010) and the stylesheet links at the end of `<head>`, and Chromium's preload scanner holds back every request after a CSP meta until the parser has read it: with the script in front, the stylesheets started only after `/prefs.js` had downloaded and run, one extra round trip before first paint on every page view (review measurement under Slow 4G: cold first contentful paint on `/en/about` 1692 ms as first written, about 1140 ms without the script). At the end of `<head>` the script waits for the stylesheets, which rendering waits for anyway, and still runs before first paint. The build fails if a page lacks the script or has it twice.
- Beyond the proposed outline, the script calls `window.stop()` before `location.replace()`: the redirected home never gets a body, so in any browser it neither paints nor reaches a screen reader while the remembered home loads. Chromium already stops parsing there on its own (observed under Playwright); the call makes it explicit everywhere.
- `tests/islands/prefs-head.test.ts` runs the file against stubs of the four browser globals it reads: the keys, eras and languages agree with the source modules, the follow rule holds (stop, then replace, only on a redirected language home and only for a supported, different language), storage failures are silent, and the gzip size stays at most 1 KB (833 bytes when accepted, 955 by Node's zlib after the WebKit fix: the next change to the script trims its comments, which every visitor downloads, before it grows the code). TASK-005's edge budget test counts module scripts only.
- `tests/e2e/prefs.edge.spec.ts` (project `edge`, Chromium under `wrangler dev`; also Firefox and WebKit on demand, see Cross-browser verification): `/prefs.js` ends `<head>`, classic, after the CSP meta and every stylesheet, on a decade page, the home, a static page and a 404 page; the first animation frame of a decade page already wears the stored era (and the museum theme without it); a remembered language replaces the home the `/` redirect chose, that home never gets a body, and Back skips it. Since Caching: the script has one hashed URL on every page, its name is the hash of what it serves, `/prefs.js` itself is 404, and a second page view takes it and the stylesheets from the browser cache.
- `eslint.config.js` lints `public/**/*.js` as classic browser scripts, with the browser globals listed by hand.
- Tested first in Chromium only; Firefox and WebKit followed the same day (Cross-browser verification).

## Caching (2026-10-15)

Every response of the assets binding carried `Cache-Control: public, max-age=0, must-revalidate`, so each page view revalidated `/prefs.js` and every stylesheet before first paint. Measured under `wrangler dev`, Chromium, `/en/about` then `/en/privacy`: the second view sent four conditional requests (three stylesheets and `/prefs.js`, one 304 each, Resource Timing `transferSize` 300 bytes apiece) before it could paint.

- The Worker now sends `Cache-Control: private, max-age=31536000, immutable` on a 200 from the binding for any path under `/_astro/` (`serveAsset` in `worker/src/index.ts`). Every name there carries a hash of its content, so a deploy that changes a file changes its URL. `private`, by the owner's choice after the security review: browsers cache the same, and no shared cache keeps preview's files past Cloudflare Access (Cloudflare does not cache Worker responses in any case). The Worker asks the binding for these paths without `If-None-Match` and `If-Modified-Since`, because the binding answers a matching ETag with a 304 for its 404 page too, and an immutable 304 would keep a stored 404 for a year (found in that review); a revalidation gets the file whole, once. HTML pages, 404 pages (also under `/_astro/`), the `/` redirect, `/api/*` and the files outside `/_astro/` (`favicon.svg`, `csp.json`, `build.json`, `robots.txt`) keep their headers.
- The build serves `public/prefs.js` byte for byte as `/_astro/prefs.<hash>.js` (the first 8 characters of the base64url SHA-256 of the file, as Vite names its output), rewrites the script element it moves to the end of `<head>`, and removes `dist/prefs.js` (`placePrefsScript` in astro.config.mjs). Still classic, same-origin, render-blocking, without inline code and allowed by `script-src 'self'`: no CSP change. `astro dev` keeps serving `/prefs.js`.
- The build refuses a `public/_astro/` folder: public files keep their names, and under `/_astro/` a changed one would never reach a visitor who already holds it.
- After: the same second view sends no request but the page itself (`transferSize` 0 for the three stylesheets and the script) in Chromium, Firefox and WebKit. `tests/e2e/prefs.edge.spec.ts` checks this, the header on the script and that its name is the hash of what it serves; `tests/e2e/edge.spec.ts` and `worker/test/worker.test.ts` check which responses get the header, including a missing `/_astro/` file asked again with its ETag.
- Before the first production deploy: rerun the Firefox and WebKit projects (Cross-browser verification); on the live site, `curl -sI` a `/_astro/` file and a page to see both headers, and check that the zone's Browser Cache TTL respects existing headers. A rollback is a security concern now: docs/SECURITY.md section 4.

## Cross-browser verification (2026-10-15)

`tests/e2e/prefs.edge.spec.ts` in Playwright's Firefox 157 and WebKit 27.2 (Windows builds), on demand: `PLCMUSEUM_E2E_ALL_BROWSERS=1 pnpm exec playwright test --project=edge-firefox --project=edge-webkit` (playwright.config.ts). CI keeps installing Chromium only.

- Firefox: all seven tests pass unchanged (the end of `<head>`, the first frame with and without the stored era, the follow rule, the cache).
- WebKit applies the CSP's `upgrade-insecure-requests` to `http://localhost`, which Chromium and Firefox exempt, so over plain `wrangler dev` every stylesheet and script went to `https://localhost:8787` and no page loaded. Production is HTTPS only, so this is the harness: both projects run against a second `wrangler dev` over HTTPS (`--local-protocol https`, its self-signed certificate, port 8788).
- WebKit reports `redirectCount` 0 in the `PerformanceNavigationTiming` entry of the home the `/` 302 led to, where Chromium and Firefox report 1; its older `performance.navigation.redirectCount` says 1 (and 0 without the redirect). The follow rule never fired there: the visitor kept the home of `Accept-Language`. `/prefs.js` now accepts either count; both interfaces count same-origin redirects only, and a browser without `performance.navigation` falls back to the entry. Not verified on Safari for macOS or iOS, whose network stack differs from this Windows build.
- WebKit fires no `pagehide` for a document stopped in its `<head>`, so the test no longer reads the body there: a mutation observer records whether the parser ever gave each document a body. In all three engines the replaced English home never got one, and Back skips it.
- After the fix: Chromium 36 of 36 edge tests, Firefox 7 of 7 and WebKit 7 of 7 prefs tests pass.
