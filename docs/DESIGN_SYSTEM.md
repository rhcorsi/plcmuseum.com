# Design system and component contracts

## 1. Token contract (`src/styles/tokens.css`)

All components consume semantic tokens only. Era themes override the same names, except the stage geometry (`--stage-*`, section 2). Base set (museum theme, Era UI off):

```
--color-bg, --color-bg-elevated, --color-surface, --color-surface-hover
--color-text, --color-text-muted, --color-text-inverse
--color-accent, --color-accent-contrast, --color-border, --color-focus
--color-state-ok, --color-state-warn, --color-state-alarm      (reserved: state only, never decoration)
--font-display, --font-body, --font-mono, --font-numeric (year watermark digits)
--text-xs ... --text-3xl (fluid clamp scale)
--radius-sm, --radius-md, --radius-lg, --border-width
--shadow-sm, --shadow-md, --shadow-stage
--space-1 ... --space-8
--motion-fast (150ms), --motion-base (250ms), --motion-slow (400ms), --motion-stage (750ms), --motion-ease, --motion-ease-stage
--stage-perspective, --stage-gap, --stage-tilt (deg), --stage-scale-side, --stage-item-width, --stage-pitch, --stage-depth
```

Dark mode: tokens are defined for light under `:root` and for dark under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, plus `:root[data-theme="dark"]`. Era themes use the same two dark selectors, for the values that differ from their own light values.

## 2. Era themes (`src/styles/themes/*.css`, owner: Gemini)

Activated by `html[data-era="<era>"]`. Each theme file overrides semantic tokens and may add decorative layers on `body::before` (scanlines, bevel textures) guarded by `@media (prefers-reduced-motion: no-preference)` and `@media (prefers-contrast: no-preference)`. Rules every era keeps (enforced by `tests/styles/tokens.test.ts`): decoration stays behind the content and never covers exhibit images or text (so scanlines and bevel noise read as page-background texture, not as a screen-wide overlay); the stage geometry (`--stage-*`) is the museum's, so the stage does not move when the era switches; a theme declares only what differs from the museum theme; and state colors keep their meaning, with accent, focus ring and body text at least 10 CIEDE2000 from every state color.

| Era | Mood | Type | Shape | Notes |
|---|---|---|---|---|
| 1970s | Painted metal panel, engraved nameplate, red 7-segment accents | Engraved sans for display, humanist body, mono for numbers | Square, thick borders | 7-segment digits only for the year watermark |
| 1980s | Phosphor CRT (green or amber), DOS terminals | Monospace everywhere | Square, 1 px borders, no shadows | Subtle scanline overlay, cursor blink on the tagline (reduced-motion: none) |
| 1990s | Gray bevelled 3D buttons, dialog windows | System-ui style, open-licensed lookalike | 0 radius, inset/outset bevels | No proprietary fonts or icons |
| 2000s | Dark high-contrast metal, glossy touch HMIs | Condensed display, clean body | Medium radius, gradients | Keep contrast AA on gradients |
| 2020s | ISA-101 high-performance HMI | Neutral sans | Small radius, flat | Grays only; color reserved for state tokens |

The default museum theme is neutral, high-contrast, image-first, and must look good when Era UI is off (most visitors never toggle it).

## 3. Components and contracts

Static Astro components (owner: Claude Code unless assigned):
- `Header` (brand text, primary navigation, language links enhanced by the LanguageSwitch script, the EraToggle, decade selector), `Footer`, `DecadeSelector`, `SpecGrid` (4 columns: CPU & scan, memory & I/O, networks & languages, application & lifecycle), `ModulePills`, `SourceList`, `StoryWall` (server-rendered list), `ShareCard` (build-time only), `ExhibitHero` (year watermark, cut-out image or silhouette, title, tagline).
- `StageList`: the server-rendered `<ol class="stage-list">` that the CoverFlow island enhances (class and data hooks in `STAGE_HOOKS`, `src/islands/contracts.ts`).
- Smaller building blocks in `src/components/`: `LanguageLinks` (static language switch), `LanguageChooser`, `ExhibitVisual` (photo or `<use>` illustration), `YearLabel` (approx. label), `FactList`, `LifecycleDetails`, `ExhibitLinks`, `TranslationBadge`, `EmptyState`, `Prose`; `src/components/dev/FixtureSwitches.astro` for fixture pages.

React islands (owner: Codex):
- `CoverFlow`: props `{ exhibits: ExhibitCard[]; listId: string; initialId: string; lang: Lang; eraUiEnabled: boolean; labels: { prev; next; open } }` (`CoverFlowProps` in `src/islands/contracts.ts`); it drives the StageList whose id is `listId` instead of rendering its own list; events `onCenterChange(id)` and `CENTER_CHANGE_EVENT`; keyboard ← → Home End, touch swipe, scroll-snap; reduced-motion → vertical list with the same markup; progressive enhancement over the server-rendered list.
- `TimelineScrubber`: props `{ items: TimelineItem[]; listId; labels: { label; decades }; onSelect? }` (`TimelineScrubberProps`). A native `<input type="range">` with one step per exhibit over a decorative decade axis. It reads the current exhibit from the stage list at attach, emits `EXHIBIT_SELECT_EVENT` (and `onSelect(id)`) for the picks the visitor commits, and follows `CENTER_CHANGE_EVENT`. Without JS it renders nothing visible (the stage list and the decade pages are the fallback). `DecadeSelector` stays plain navigation.
- `StoryForm`: props `{ exhibitId; lang; turnstileSiteKey; endpoint }`; client validation mirroring the schema, honeypot, Turnstile widget, success and error states in `i18n`.

Script components (owner: Codex; an Astro component plus a TypeScript module under `src/islands/<name>/` loaded with `<script src>`, no framework; ADR-0011):
- `EraToggle`: props `{ lang }` (`EraToggleProps`); a native switch button that persists `STORAGE_KEYS.eraUi`, applies `html[data-page-era]`, follows `CENTER_CHANGE_EVENT`, emits `ERA_CHANGE_EVENT` and announces only the visitor's own changes (hooks `ERA_HOOKS`, `ERA_TOGGLE_HOOKS`). `/prefs.js` has already applied the stored state before first paint (ADR-0012), so the toggle starts without a museum-first flash.
- `LanguageSwitch`: behavior on `LanguageLinks` (hooks `LANGUAGE_HOOKS`) that stores a plain click in `STORAGE_KEYS.lang`; `/prefs.js` follows it on the language home the `/` redirect chose (`?auto`, ADR-0012). The links work without JS.

`public/prefs.js` (ADR-0012, owner: Claude Code) is not a component: a classic script ending every built page's `<head>` that applies the stored era and follows the remembered language before first paint. It only reads storage, and stays at most 1 KB gzip.

Types live in `src/content/types.ts` (generated) and `src/islands/contracts.ts` (props and events). Changing a contract is a Claude Code task and bumps the task files that depend on it.

## 4. Motion rules

- Transforms and opacity only; no layout-affecting animations.
- UI: 150 to 400 ms; stage: 600 to 900 ms; easing from tokens.
- Every animation has a reduced-motion variant (crossfade or instant). Test with the OS setting, not only DevTools.
- No autoplay loops longer than 5 s; the "time-lapse" mode must have pause, keyboard stop, and is off by default.

## 5. Accessibility checklist (every component)

Keyboard operable; visible focus (`--color-focus`); roles and names; `aria-live` for state changes; alt text from content in the current language; contrast AA (AAA for body text where possible); touch targets ≥ 44 px (links inside a sentence are exempt, as in WCAG 2.5.8); no information by color alone; works without JS (static fallback).

## 6. Performance budgets

Home: ≤ 150 KB gzip JS, LCP ≤ 2.5 s on simulated 4G, CLS ≤ 0.05. Exhibit page: ≤ 60 KB gzip JS. The React 19 runtime alone is about 68 KB gzip, so a page loads React only for a React island it carries; the header's script components stay at most 3.5 KB gzip together and load no React (ADR-0011), and `/prefs.js` at most 1 KB gzip (ADR-0012). Island budgets in task files count the island's own chunk; islands receive their strings as props and never import `src/i18n/utils.ts`. Images via build pipeline (`srcset`, AVIF/WebP, lazy below the fold, hero eager). Fonts: ≤ 2 families, subset, `font-display: swap`. Lighthouse mobile ≥ 90 on performance, accessibility, best practices.

## 7. Fixture pages and visual tests

Every component has `src/pages/dev/<component>.astro` rendering `src/fixtures/` data in the default theme and in each era (query `?era=1980s`, plus `?theme=light|dark`). Astro strips the query string from prerendered pages, so `src/components/dev/FixtureSwitches.astro` applies both in the browser after load: screenshot tests wait for `html[data-era]`. The Astro dev toolbar is off so it never shows in screenshots. Implementers attach 390 px and 1280 px captures to the PR and never commit them; the architect adds Linux screenshot baselines (diffs over 0.1% fail) after TASK-002. A task file may prescribe its own fixture routes instead (per-scenario pages, or real pages) when FixtureSwitches would write `data-era` itself. Dev pages are excluded from production builds.

## 8. Imagery

Licensed photos are cut out by the pipeline (transparent background, consistent padding, slight drop shadow from tokens). When no licensed photo exists, the exhibit uses its own illustration from `content/images/<id>/`, or else the generic silhouette for its category or architecture from `src/assets/illustrations/` (mapping in `src/lib/exhibit-card.ts`), labeled "illustration" in the UI. Photos always show their credit line next to the image. Never brand marks. Never AI "reconstructions" presented as photos; if a generated illustration is used, it is labeled as such.
