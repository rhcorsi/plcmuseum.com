# ADR-0011: Header controls without React

Status: accepted by the owner, 2026-10-15 (decision 1: option 1b; decision 2: option 2b). Decision 2 amended the same day by the Amendment of ADR-0012 (option c): only the home the `/` redirect chose, which it marks with `?auto`, follows the remembered language.

## Context

- EraToggle and LanguageSwitch sit in the header of every page. docs/DESIGN_SYSTEM.md section 6 caps exhibit pages at 60 KB gzip of JS, and the React 19 runtime alone is about 68 KB gzip, so a React island in the header would put every exhibit page over its budget.
- The CSP allows `'self'` plus Astro's own hashes (ADR-0010); author inline scripts are forbidden (docs/SECURITY.md 3.1).
- The Worker cannot read localStorage, and the privacy notice promises no cookies.
- Era themes change fonts and borders, so a theme switch can reflow.
- The Worker redirects `/` by Accept-Language. A visitor who picked another language in the header lands on the Accept-Language home again on the next visit.

## Decision 1: how the two controls are built

- **1a. React islands**, raising the exhibit-page budget to about 75 KB gzip.
- **1b. Script components**: an Astro component that renders the markup and every string on the server, plus a same-origin TypeScript module under `src/islands/<name>/` loaded with `<script src>`. Astro bundles the module under `/_astro/` and never inlines it, because `assetsInlineLimit` is 0.

Chosen: 1b.

## Decision 2: the language at `/`

- **2a. Not remembered**: `/` always follows Accept-Language.
- **2b. Remembered in localStorage** (`STORAGE_KEYS.lang`) when the visitor picks a language link with a plain click (primary button, no modifier key, so the choice is made in this tab), and followed in the browser on the language home the `/` redirect chose (first written as any home reached through a same-origin redirect, Navigation Timing `type: 'navigate'` and `redirectCount > 0`; since the Amendment of ADR-0012, the home whose query is the redirect's `?auto` marker).
- **2c. A first-party cookie** that the Worker reads in the `/` redirect.

Chosen: 2b. No cookie, and the Worker never learns the choice (since the Amendment of ADR-0012 its `/` redirect adds a fixed marker to the home it picks, nothing more).

## Consequences

- No React on pages without a React island. The two controls stay at most 3.5 KB gzip together, enforced by an edge test in their task (TASK-005).
- Contracts (`src/islands/contracts.ts`): `EraToggleProps` becomes `{ lang }`; `LanguageSwitchProps` is removed (LanguageLinks.astro keeps its own props); new hooks `ERA_HOOKS`, `ERA_TOGGLE_HOOKS` and `LANGUAGE_HOOKS`.
- `<html>` gets `data-page-era`, written by Base.astro from each page: the exhibit's era on an exhibit page, the decade's era on a decade page, the first exhibit's era on the home. A script reads the page's era there without waiting for the stage.
- Module scripts run after the parser. With these controls alone, a visitor with Era UI on would see the museum theme first and get one reflow on every page view, and the remembered language would replace a home already shown. ADR-0012, accepted the same day, does both before first paint with `/prefs.js`, so the LanguageSwitch module only stores the plain click and holds no follow logic.
- For a returning visitor whose browser language differs from the remembered one, `/` costs one extra document request: the redirected home is fetched, then replaced before it gets a body (ADR-0012). Since the Amendment of ADR-0012, a link to a home keeps its language whatever its spelling: `/en` without a slash, which the assets binding redirects to `/en/`, stays English. As first written, it followed like `/`, and a cross-origin redirect before `/` (http to https, another host) or a browser without Navigation Timing Level 2 kept Accept-Language; the marker reaches the home in both cases, so they follow too.
- Preferences are stored per origin: www.plcmuseum.com and plcmuseum.com keep separate choices unless www redirects to the apex (a Cloudflare setting, left to the owner).
- Accepted cost: an era change caused by the stage lands about 870 ms after the input (the 750 ms stage transition plus the 120 ms debounce), outside the 500 ms input window of CLS, so for visitors with Era UI on, era fonts count as layout shift. Lighthouse runs with Era UI off and never sees it.
- The privacy page gains a paragraph on remembered choices (`privacy.preferences`) in the five languages; `privacy.lead` ("sets no cookies, does not track you") stays true.
