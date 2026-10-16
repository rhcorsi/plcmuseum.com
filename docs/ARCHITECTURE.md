# Architecture

## 1. Context

PLC Museum is a content-heavy, mostly static, multilingual site with two interactive showcases (Cover Flow stage, Era UI theming) and one community feature (field stories). Traffic is spiky (LinkedIn posts) and global. The team is one human plus three AI tools working in parallel. The architecture optimizes for: zero-ops hosting, a tiny attack surface, data-driven content, and safe parallel work by multiple implementers.

## 2. Principles

1. **Static-first.** Everything that can be computed at build time is. The CDN serves files; nothing renders per request.
2. **Content is data, data has a schema.** JSON files validated by JSON Schema in CI and in a Claude Code hook. The site is a pure function of `content/`.
3. **Contracts before implementation.** Types, fixtures and tokens are published before any component is written, so implementers (Codex, Gemini) work against stable interfaces.
4. **Dependencies point inward.** `content` knows nothing about `src`; `src` knows nothing about `worker`; `worker` depends only on the story schema.
5. **Smallest dynamic surface.** One POST endpoint, one health endpoint, nothing else.
6. **Reversible decisions are cheap, irreversible ones get an ADR.**

## 3. Layers

```
┌─────────────────────────────────────────────────────────────┐
│ content/  (exhibits, stories, images+meta, glossary, schemas)│  data layer
└──────────────────────────────┬──────────────────────────────┘
                               │ build-time only (Astro content collections + Zod from schema)
┌──────────────────────────────▼──────────────────────────────┐
│ src/  pages · layouts · components · islands · i18n · styles │  presentation (static output in dist/)
└──────────────────────────────┬──────────────────────────────┘
                               │ dist/ served as static assets
┌──────────────────────────────▼──────────────────────────────┐
│ worker/  Cloudflare Worker: assets binding + /api/*  + D1    │  runtime (edge)
└─────────────────────────────────────────────────────────────┘
```

## 4. Repository structure

```
plcmuseum/
├── CLAUDE.md  AGENTS.md  GEMINI.md  README.md  LICENSE  LICENSE-CONTENT
├── package.json  pnpm-lock.yaml  astro.config.mjs  tsconfig.json  wrangler.jsonc
├── eslint.config.js  prettier.config.js  playwright.config.ts  vitest.config.ts
├── content/
│   ├── schema/exhibit.schema.json  schema/story.schema.json  schema/image-meta.schema.json
│   ├── exhibits/<id>.json            one file per exhibit
│   ├── stories/                      gitignored cache written by `pnpm stories:fetch` at deploy time only
│   ├── images/<exhibit-id>/<file>.{jpg,png,svg} + <file>.meta.json
│   └── glossary.json                 technical jargon per language
├── src/
│   ├── content.config.ts             collections (Zod mirror in content/schemas.ts)
│   ├── content/types.ts              generated from schemas (json-schema-to-typescript)
│   ├── fixtures/                     typed sample data for components and tests
│   ├── i18n/{pt,en,es,de,it}.json    UI strings
│   ├── i18n/utils.ts                 t(), routing helpers
│   ├── styles/tokens.css             base semantic tokens (museum theme)
│   ├── styles/themes/{1970s,1980s,1990s,2000s,2020s}.css
│   ├── styles/motion.css
│   ├── layouts/Base.astro            html[lang][data-era][data-page-era], CSP-compatible head, /prefs.js (moved last by the build)
│   ├── components/                   static Astro components
│   ├── islands/                      React islands (CoverFlow, StoryForm, TimelineScrubber) and the client modules of script components (era-toggle, language-switch)
│   ├── pages/[lang]/index.astro      home: stage + decade selector + timeline
│   ├── pages/[lang]/exhibits/[slug].astro
│   ├── pages/[lang]/decades/[decade].astro
│   ├── pages/[lang]/contribute.astro   story form + guidelines
│   ├── pages/[lang]/about.astro, privacy.astro, credits.astro
│   ├── pages/dev/*.astro             fixture pages (dev builds only)
│   └── pages/og/[...].png.ts         build-time share cards
├── public/                           copied as is: favicon, robots.txt, prefs.js (preferences before first paint, ADR-0012; built as _astro/prefs.<hash>.js)
├── worker/
│   ├── src/index.ts                  fetch handler: assets passthrough, /api/stories, /api/health, security headers
│   ├── src/stories.ts                validation (Zod), Turnstile verify, rate limit, insert
│   ├── schema.sql                    D1 schema
│   └── README.md                     API contract
├── scripts/
│   ├── validate-content.mjs          Ajv + custom rules (sources, licenses, ids)
│   ├── images-process.mjs            sharp pipeline → src/assets/generated (never commits originals' derivatives twice)
│   ├── stories-moderate.mjs          owner only: list / approve / reject rows in D1
│   ├── stories-fetch.mjs             deploy only: approved rows → content/stories cache (gitignored)
│   ├── check-public-safety.mjs       forbidden files and secret-looking values (pre-commit + CI)
│   ├── gen-types.mjs                 schemas → src/content/types.ts
│   └── hooks/post-edit.mjs           Claude Code hook: validate when content changes
├── prototypes/                       throwaway visual prototypes
├── docs/                             this folder (docs/private/ is gitignored: owner's plan and notes)
└── .github/workflows/ci.yml deploy.yml
```

## 5. Data model (summary; schemas are the truth)

**Exhibit** (`content/exhibits/<id>.json`): identity (`id`, `slug`, `name`, `family`, `manufacturer`, `brand_at_launch`, `current_owner`, `country_of_origin`), classification (`category`, `architecture`, `sectors`, `decade`, `year_introduced`, `year_introduced_precision`), language-neutral `specs` (cpu, scan_time_ms_per_k, memory, io_max, networks, languages), `lifecycle` (discontinued_year, end_of_support_year, last_firmware, migration_paths, still_in_service_note), `related_modules`, `images` (+ sidecar meta), `links` (partner, vendor history, video, manual), `sources` (typed, with URLs and access dates), `verification` (level, unverified_fields, reviewer, date), `text.<lang>` (tagline, summary, field_quirk, alt_text, status), `review_status` (draft, review, published), `tags`.

Rules enforced by the validator: ids unique and equal to file names; `review_status: published` requires `verification.level: verified`, empty `unverified_fields`, at least one source, at least one image with a valid license, `text.pt` and `text.en` present and `verified`; every image referenced has a meta file whose license is in the allowlist.

**Story** (shape in `content/schema/story.schema.json`, stored in D1, never in git): `exhibit_id`, `display_name`, `role`, `country`, `original_lang`, `year_of_memory`, `text` (≤ 1500 chars), `consent` (display_name, license, machine_translation), `status`, `submitted_at`, `approved_at`. At deploy time `pnpm stories:fetch` writes approved rows to the gitignored `content/stories/` cache; fictional `src/fixtures/stories.ts` fill in only for development builds (`src/content/queries.ts`), never for preview or production. Translations are generated at build time into `translations.<lang>` and are always labeled as machine translation. Removal is a row delete plus a redeploy (ADR-0008).

**Glossary** (`content/glossary.json`): term → per-language jargon (PLC/CLP/SPS, DCS/SDCD/PLS, LD/KOP, IL/AWL, FBD/FUP, ST/SCL, scan time/Zykluszeit...). Used by the translation skill and by the UI.

## 6. Build pipeline

1. `node scripts/check-public-safety.mjs` and `pnpm validate:content` (Ajv + rules) must pass.
1b. Deploys only (`.github/workflows/deploy.yml`, or the owner's `pnpm deploy:preview|deploy:prod` through `scripts/deploy.mjs`): `pnpm stories:fetch` pulls approved stories from D1 into the gitignored cache before `pnpm validate:content` runs, so the cache is validated too. It fails with a clear message when `CLOUDFLARE_API_TOKEN` is absent (contributor and fork builds simply do not run it). Until Phase 3 it writes an empty cache, so preview and production show no stories rather than fixtures.
2. `pnpm gen:types` regenerates `src/content/types.ts` from the schemas (committed, diff reviewed).
3. `pnpm images:process` creates AVIF/WebP variants (320 to 1600 px) and cut-outs for the stage from licensed originals; outputs are build artifacts, not committed (cached in CI).
4. `astro build` renders every page for every language: `/{lang}/`, `/{lang}/exhibits/{slug}`, `/{lang}/decades/{decade}`, plus `/` redirecting by `Accept-Language` at the edge (Worker) with a cookieless fallback to `/en/`. With `security.csp` on, Astro hashes its inline island scripts and styles into a CSP meta element per page. The `siteBuild` integration in `astro.config.mjs` then writes `build.json` (for `/api/health`), removes `/dev` and unreachable assets, and writes `csp.json`, the union of those hashes, for the Worker's header (ADR-0010), and serves `public/prefs.js` as `_astro/prefs.<hash>.js` at the end of every `<head>` (ADR-0012). It refuses a `public/_astro/` folder, since everything under `/_astro/` is cached as content-hashed. The e2e job alone builds with `PLCMUSEUM_E2E_FIXTURES=1`, which adds one test page per `tests/e2e/fixtures/*.astro` under `/e2e/` (for example `/e2e/islands`).
5. Share cards are rendered at build (`satori` + `resvg`) per exhibit and language.
6. Output `dist/` is uploaded as Worker static assets.

## 7. Runtime (Cloudflare)

- One Worker (`wrangler.jsonc`): `assets` binding serves `dist/` with `not_found_handling: "404-page"` (the nearest `<lang>/404.html`) and `run_worker_first: true`, so the fetch handler sees every request: it adds the security headers of `worker/src/security-headers.ts` to every response, handles the `/` language redirect (to `/<lang>/?auto`, the one home `/prefs.js` may replace with the remembered language, ADR-0012), and routes `/api/*`. Files under `/_astro/` all have content-hashed names, so the Worker asks the binding for them without validators and gives each 200 `Cache-Control: private, max-age=31536000, immutable` (a 304 could stand for the 404 page); HTML pages and everything else keep the binding default `public, max-age=0, must-revalidate`, so a deploy reaches visitors on their next page view. The Content-Security-Policy is the documented one plus the island hashes in `csp.json`, which the Worker reads through the assets binding once per isolate (`worker/src/csp.ts`, ADR-0010). No Node compatibility flag; the daily cron trigger is enabled in Phase 3 with the retention job.
- `POST /api/stories`: JSON body validated with Zod (mirrors `story.schema.json`), Turnstile token verified server-side, per-IP rate limit (Cloudflare Rate Limiting rule plus a D1 `ip_hash` with a daily salt), HTML stripped, inserted with `status = 'pending'`. Returns `202` and a thank-you id. Nothing is readable through the API.
- `GET /api/health`: build id and date read from `build.json`, which the build integration in `astro.config.mjs` writes; no secrets, no DB.
- D1 database `plcmuseum-stories`. Moderation is done by the owner through `pnpm stories:moderate` (lists pending, approves or rejects by id directly in D1); the next deploy fetches approved stories at build time. Nothing about stories is committed to git. No admin UI in the MVP.
- Analytics: none yet (docs/SECURITY.md 3.1: Cloudflare Web Analytics needs an ADR that adds its origins to the CSP). Workers Logs keep exceptions only (invocation logs off).
- Environments: `local` (wrangler dev + miniflare D1), `preview` (`preview.plcmuseum.com` behind Cloudflare Access, deployed from any branch on demand), `production` (`plcmuseum.com` and `www`, deployed from `main` by the owner, later by CI once Phase 3 closes).

## 8. Era UI contract

`<html data-era>` selects the theme: "museum" (Era UI off, tokens.css) or one of the five eras. Pages that have an era also carry `data-page-era` (the exhibit's era, the decade's era, or on the home the first exhibit's era), written by Base.astro. The EraToggle script component (ADR-0011) keeps the preference in localStorage (try/catch), applies `data-page-era` while Era UI is on, and follows the stage's CENTER_CHANGE_EVENT. `/prefs.js`, a classic script ending every `<head>` (ADR-0012), applies the stored preference before first paint, so a visitor with Era UI on never sees the museum theme first. These two are the only writers of `data-era` in production. Components never read the attribute; they read tokens.

## 9. Cover Flow contract

`CoverFlow` island receives `CoverFlowProps` (`src/islands/contracts.ts`: the `ExhibitCard` list, the id of the StageList it enhances, `initialId`, `lang`, `eraUiEnabled` and its labels). It renders a horizontally navigable stage (CSS 3D transforms, scroll-snap, keyboard arrows, touch), emits `onCenterChange(id)`, and degrades to a vertical list when `prefers-reduced-motion` is set or JS is unavailable (the list is server-rendered first; the island enhances it). No WebGL.

## 10. Scaling and performance

Static assets scale with Cloudflare's edge; content-hashed files under `/_astro/` are cached by browsers for a year, so a repeat view revalidates only the HTML before first paint (ADR-0012). Budgets: ≤ 150 KB gzip JS on home, LCP ≤ 2.5 s on 4G, images AVIF/WebP with `srcset`, fonts self-hosted and subset. Era themes may change fonts and borders, so a theme switch can reflow: a switch the visitor makes falls inside the input window, the stored era is applied before first paint (ADR-0012), and stage-driven switches with Era UI on are an accepted cost (ADR-0011). D1 stays tiny (hundreds of stories); if stories outgrow the repo (thousands), move the wall to a read-only edge endpoint with caching (ADR required).

## 11. Observability

Workers Logs (exceptions only) and `wrangler tail` while debugging; a weekly `GET /api/health` check from a scheduled task; CI badges. Planned: Cloudflare Web Analytics once an ADR adds it to the CSP, and a Lighthouse CI job on PRs.

## 12. Decisions

See `docs/adr/README.md` (ADR-0001 to ADR-0012).
