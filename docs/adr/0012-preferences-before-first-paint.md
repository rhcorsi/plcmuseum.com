# ADR-0012: Preferences applied before first paint

Status: accepted by the owner, 2026-10-15 (option b), and implemented the same day. Amended the same day (Amendment, option c): only the home the `/` redirect chose follows the remembered language.

## Context

ADR-0011 builds EraToggle and LanguageSwitch as module scripts, which run after the parser. On their own, they apply the stored era after first paint (a visitor with Era UI on sees the museum theme, then the page reflows into the era theme, on every page view), and the remembered language replaces a home that has already been shown, which a screen reader may have started to read.

## Options

- **(a) Nothing**: accept both.
- **(b) A render-blocking, classic, same-origin `/prefs.js`** loaded in `<head>`, ending it in the built pages (after Astro's CSP meta and the stylesheets; see Implementation).
- **(c) An inline script hashed at build time**: an author inline script, which docs/SECURITY.md 3.1 forbids, and one more hash in every CSP header.

## Decision

Option (b). `/prefs.js` runs before anything paints and only reads localStorage:

- on the language home (`/<lang>/`) the Worker's `/` redirect chose, the one whose query is exactly `?auto` (since the Amendment; first written as any home reached through a same-origin redirect counted by Navigation Timing), it removes the marker from the address bar, and when `STORAGE_KEYS.lang` holds another of the five languages it stops the parser and replaces the page with that language's home, keeping the fragment;
- otherwise, when `STORAGE_KEYS.eraUi` is "1", it sets `html[data-era]` to `html[data-page-era]` if that is one of the five eras;
- any failure (storage or history blocked) leaves the museum theme and the language the page was served in.

## Consequences

- One small request on a first visit, fetched in parallel with the stylesheets (once the script ends `<head>`), which block rendering anyway; later page views take it from the browser cache (see Caching). Its own budget: at most 1 KB gzip.
- No CSP change: `script-src 'self'` allows it. `<script is:inline src="/prefs.js">` passes `astro/no-unsafe-inline-scripts` because it has `src`, and Astro emits no hash for it (`csp.json` keeps its 7 script hashes).
- The follow rule lives only in `/prefs.js`: the LanguageSwitch module of TASK-005 stores plain clicks and nothing else. EraToggle initializes from storage and finds `html[data-era]` already applied, so it starts without a museum-first flash or a reflow.
- `/prefs.js` is outside the bundle, so it repeats the storage keys, the five eras and the five languages as literals. A change to any of them now touches `src/islands/contracts.ts`, `src/lib/era.ts` or `src/i18n/langs.ts` and `public/prefs.js` together; the parity test fails until they agree.
- `ERA_HOOKS.applied` and `STORAGE_KEYS` name `/prefs.js` as the second writer of `data-era` and the before-paint reader of both keys; docs/SECURITY.md 3.1 lists the script.

## Implementation (2026-10-15)

- `public/prefs.js`, written by `src/layouts/Base.astro` near the top of `<head>` (so `astro dev` runs it too) and moved by the build to the end of `<head>` (`placePrefsScript` in astro.config.mjs, which also gives it its hashed name; see Caching). Astro injects its CSP meta (ADR-0010) and the stylesheet links at the end of `<head>`, and Chromium's preload scanner holds back every request after a CSP meta until the parser has read it: with the script in front, the stylesheets started only after `/prefs.js` had downloaded and run, one extra round trip before first paint on every page view (review measurement under Slow 4G: cold first contentful paint on `/en/about` 1692 ms as first written, about 1140 ms without the script). At the end of `<head>` the script waits for the stylesheets, which rendering waits for anyway, and still runs before first paint. The build fails if a page lacks the script or has it twice.
- Beyond the proposed outline, the script calls `window.stop()` before `location.replace()`: the redirected home never gets a body, so in any browser it neither paints nor reaches a screen reader while the remembered home loads. Chromium already stops parsing there on its own (observed under Playwright); the call makes it explicit everywhere.
- `tests/islands/prefs-head.test.ts` runs the file against stubs of the four browser globals it reads: the keys, eras and languages agree with the source modules, the follow rule holds (stop, then replace, only on a redirected language home and only for a supported, different language), storage failures are silent, and the gzip size stays at most 1 KB (833 bytes when accepted, 955 by Node's zlib after the WebKit fix: the next change to the script trims its comments, which every visitor downloads, before it grows the code). TASK-005's edge budget test counts module scripts only. The Amendment narrows the follow rule to the home the `/` redirect marks `?auto` and brings the file to 866 bytes.
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
- WebKit reports `redirectCount` 0 in the `PerformanceNavigationTiming` entry of the home the `/` 302 led to, where Chromium and Firefox report 1; its older `performance.navigation.redirectCount` says 1 (and 0 without the redirect). The follow rule never fired there: the visitor kept the home of `Accept-Language`. `/prefs.js` now accepts either count; both interfaces count same-origin redirects only, and a browser without `performance.navigation` falls back to the entry. Not verified on Safari for macOS or iOS, whose network stack differs from this Windows build. The Amendment removed both counts from the script.
- WebKit fires no `pagehide` for a document stopped in its `<head>`, so the test no longer reads the body there: a mutation observer records whether the parser ever gave each document a body. In all three engines the replaced English home never got one, and Back skips it.
- After the fix: Chromium 36 of 36 edge tests, Firefox 7 of 7 and WebKit 7 of 7 prefs tests pass.

## Amendment: follow only after the `/` redirect (2026-10-15)

Status: accepted by the owner, 2026-10-15 (option c), and implemented the same day.

### Context

As first written, the follow rule fired on a language home reached through any same-origin redirect, because Navigation Timing counts redirects but cannot say which one happened. The Worker answers `/` itself, but the assets binding's `html_handling: "auto-trailing-slash"` also answers the other spellings of a home with a same-origin 307. A link to `/pt` (no slash, the way people type and some apps shorten links) is therefore replaced by the visitor's remembered language, although ADR-0011 promises that a link keeps its language. ADR-0011 already lists `/en` as following like `/`; the security review of the caching change flagged it, and since that change it holds in WebKit too.

Measured under `wrangler dev` over the production build (Chromium on HTTP, Firefox 157 and WebKit 27.2 on HTTPS), `Accept-Language: en`, the redirect counts read on the home that loads, and where a visitor who remembered Italian lands:

| Request                                    | Answer                                          | Counted (entry; WebKit `performance.navigation`) | Remembered `it` lands on                     |
| ------------------------------------------ | ----------------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| `/`                                        | Worker 302 to `/en/`                            | 1 (WebKit: 0; 1)                                 | `/it/` (intended)                            |
| `/index.html`, `/index`                    | binding 307 to `/`, then the Worker's 302       | 2 (WebKit: 0; 2)                                 | `/it/` (it asks for the root, so intended)   |
| `/pt`, `/de`, any `/<lang>`                | binding 307 to `/<lang>/`                       | 1 (WebKit: 0; 1)                                 | `/it/` (the problem)                         |
| `/pt?x=1#f`                                | binding 307 to `/pt/?x=1`, fragment kept        | 1 (WebKit: 0; 1)                                 | `/it/?x=1#f` (the problem)                   |
| `/pt/index.html`, `/pt/index`              | binding 307 to `/pt/`                           | 1 (WebKit: 0; 1)                                 | `/it/` (the problem)                         |
| `/pt/`                                     | 200                                             | 0                                                | `/pt/` (kept)                                |

The same happens in all three engines. Any same-origin redirect added later onto a home (a Cloudflare redirect rule on the zone, a renamed page) would follow as well.

### Options

- **(a) Accept and document.** No code change; the prefs.js comment and the Decision above say "a link to a home with its trailing slash keeps its language", and an edge test pins that `/pt` follows. Cost: a link to `plcmuseum.com/pt` sends a returning visitor who picked another language to that language instead.
- **(b) The Worker serves a home at its other spellings.** `/<lang>`, `/<lang>/index` and `/<lang>/index.html` get the home itself (200, query kept, the binding asked for `/<lang>/`) instead of the binding's 307, so the Worker's `/` answer is the only redirect that lands on a home today. `/prefs.js` is unchanged (955 bytes gzip). Costs: each home answers at four URLs (every page already carries `<link rel="canonical">` to `/<lang>/`, and every link in the built pages is absolute, so they render the same); a Worker route for one class of path; the follow rule is still "any same-origin redirect", so the next redirect onto a home brings the problem back without any test failing; the WebKit special case stays.
- **(c) The `/` redirect marks its target.** The Worker answers `/` with `Location: /<lang>/?auto`. `/prefs.js` follows only on a language home whose query is exactly `?auto`, and drops the marker from the address bar with `history.replaceState()` before it reads storage, whether it follows or not. Navigation Timing leaves the script, and with it the WebKit special case and the gap for browsers without Navigation Timing Level 2. Prototype: 855 bytes gzip (from 955). Costs: the `/` redirect target changes (worker README, docs/ARCHITECTURE.md, docs/I18N.md, unit and edge tests); `/prefs.js` gets its first write, to the current history entry only (no storage, cookie or request), which docs/SECURITY.md 3.1 must say; with JavaScript off the address bar keeps `/en/?auto` (crawlers see it as the redirect target, and the canonical link names `/en/`); a link that carries `?auto` acts like `/` and sends the visitor to their own remembered home, a fixed path built from the five languages, so nothing leaves the device; `/en/?auto` is a second HTTP cache entry beside `/en/` (both revalidate).
- **(d) The Worker serves the negotiated home at `/` (200) and `/prefs.js` follows on `/`.** Rejected: `/` becomes a page whose content depends on `Accept-Language`, links to `/` no longer name their language, and it changes the URL scheme of docs/ARCHITECTURE.md for a problem a redirect target can solve.

Recommended: (c). It ties the follow rule to the one answer meant to trigger it, so no present or future redirect can, and the special case for WebKit disappears instead of growing. Its price (a marker visible without JavaScript, one write to the address bar, a changed redirect target) is smaller than serving each home at four URLs and still depending on how many redirects a browser counts.

### Implementation (2026-10-15)

- `worker/src/index.ts` answers `/` with `Location: /<lang>/?auto` (`AUTO_QUERY` in `worker/src/language.ts`; the query of `/` is still dropped, a fragment of `/` still reaches the home).
- `/prefs.js`, on `/<lang>/` with the query `?auto`: `history.replaceState(null, '', '/<lang>/' + fragment)` first, so blocked storage still leaves a clean address; then it reads `STORAGE_KEYS.lang` (only there now) and follows as before, `window.stop()` then `location.replace()`. Any other query (`?auto=1`, `?ref=post&auto`) or none keeps the language and the address. 866 bytes gzip by Node's zlib (from 955), with no Navigation Timing.
- Changed by the marker, beyond `/pt`: a cross-origin redirect before `/` (http to https, a link shortener) and a browser without Navigation Timing Level 2 now follow too, since the marker reaches the home in both cases; the WebKit special case of Cross-browser verification is gone with the counts it read. An address copied as `/en/?auto` (from a browser with JavaScript off) or written by hand sends a recipient who remembered another language to that language, as `/` would.
- `tests/islands/prefs-head.test.ts` drives the follow cases with the Worker's `AUTO_QUERY`, so a marker changed on one side fails the other, and checks the address after each run; its audit allows `history.replaceState` with the home's own path and nothing else from `history`. `worker/test/worker.test.ts` and `tests/e2e/edge.spec.ts` expect the marked `Location`. `tests/e2e/prefs.edge.spec.ts` adds that `/en`, `/en?ref=post` and `/en/index.html` (each a 307 from the binding) keep English for a visitor who remembered Portuguese, and that the address loses the marker when the home stays.
- docs/SECURITY.md 3.1 says the script writes nothing but the address bar, worker/README.md documents the marker, and ADR-0011 (decision 2b and its consequences), docs/I18N.md, docs/ARCHITECTURE.md and TASK-005 follow the new rule.
- Verified on the final build under `wrangler dev`: Chromium 43 of 43 edge tests, and Firefox 157 and WebKit 27.2 (Windows builds, over HTTPS) 12 of 12 prefs tests each. Firefox needs `--workers=1` on a loaded machine: run with parallel workers beside other jobs, it timed out while opening pages and contexts (never on an assertion) and logged graphics errors, in tests this change does not touch as well.
- Reviewed by the reviewer and security-reviewer subagents: nothing blocking. Applied from their notes: the unit audit runs the script through a scope that records every free identifier, so a call through a global it was not given (`open`, `top`, `navigation`) fails it even when the script's try/catch swallows the error; it also covers a marked home that stays. Proposed, not done here: list `public/prefs.js` and `astro.config.mjs` explicitly in CODEOWNERS and among the paths a fork PR needs the owner's approval for.
