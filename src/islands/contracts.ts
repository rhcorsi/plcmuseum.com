// Props, events and markup hooks of the islands: the React islands and the script components of ADR-0011
// (docs/DESIGN_SYSTEM.md section 3). This file is the contract the task files in docs/tasks/ point to: islands
// implement it, pages and src/lib/exhibit-card.ts produce it.
// Changing it is an architect task that also updates every task file that depends on it.
import type { Decade, Exhibit } from '../content/types';
import type { Lang } from '../i18n/langs';
import type { EraAttribute, EraTheme } from '../lib/era';

export type { Decade, EraAttribute, EraTheme, Lang };

/** A raster image produced by the build pipeline; width and height reserve the aspect ratio (no layout shift). */
export type ExhibitImage = {
  src: string;
  /** `w`-descriptor candidates; the component sets `sizes` for its own layout. */
  srcset: string;
  width: number;
  height: number;
  /** Credit line from the image's license sidecar (attribution_text); always shown next to the photo. */
  credit: string;
};

/** One exhibit as the stage, the timeline and the share cards see it, already resolved for one page language. */
export type ExhibitCard = {
  id: string;
  slug: string;
  /** Exhibit page in the page language, e.g. "/pt/exhibits/ab-plc-5". */
  href: string;
  /** Product name as the manufacturer named it at launch (never translated). */
  name: string;
  /** Brand at launch, as text (identification only, never a logo). */
  manufacturer: string;
  /** Digits only. Use it for the decorative, aria-hidden year watermark (docs/I18N.md) and for sorting. */
  year: number;
  yearPrecision: Exhibit['year_introduced_precision'];
  /**
   * The year as readable text in the page language: "1986", or "approx. 1986" when yearPrecision is not "exact".
   * Every visible, non-decorative year uses this, never `year` alone.
   */
  yearLabel: string;
  decade: Decade;
  /** Era UI theme for this exhibit (its decade, or its era_theme_override). */
  era: EraTheme;
  tagline: string;
  /** Language of `tagline` and `alt`; differs from the page language while that translation does not exist yet. */
  textLang: Lang;
  /** Alternative text for whichever visual is shown (photo or illustration). */
  alt: string;
  /** Licensed photo, or null. */
  image: ExhibitImage | null;
  /**
   * Original illustration used when there is no licensed photo, labeled "illustration" in the UI.
   * A same-origin `<use>` reference such as "/_astro/rack-modular.abc123.svg#art": render it as
   * `<svg viewBox="0 0 640 260" role="img" aria-label={alt}><use href={silhouette} /></svg>` so the strokes
   * (drawn in currentColor) follow the theme tokens. Never inline SVG markup.
   */
  silhouette: string | null;
};

// ---- islands

/**
 * CoverFlow enhances the server-rendered StageList instead of rendering a second list: it finds the
 * `<ol id={listId} class="stage-list">` (src/components/StageList.astro, hooks in STAGE_HOOKS), renders only its own
 * controls and live region, and drives the existing items through classes, ARIA attributes and CSS custom properties
 * set with element.style.setProperty(). `exhibits` is the same data, for lookups and announcements.
 *
 * While the stage is active the list is a listbox driven by aria-activedescendant, so no interactive control is
 * nested in an option:
 * - `<ol>`: role="listbox", tabindex="0", aria-orientation="horizontal",
 *   aria-activedescendant="stage-link-<centered id>" (never the `<li>` id);
 * - `<li>`: role="none" and no aria-* attribute (any would cancel role="none");
 * - link `a.card`: role="option", aria-selected, tabindex="-1", aria-posinset and aria-setsize. It keeps the name
 *   and description StageList gives it (name, manufacturer and yearLabel; the tagline); no aria-label.
 * The listbox owns focus: when an option receives DOM focus (a pointer press), the island moves focus to the list.
 * Enter and the Open link follow the centered link; a click or assistive-technology activation on the centered
 * option follows it, and on another option centers that option without navigating. The Open link names the
 * exhibit with aria-describedby="stage-name-<id>". When the stage deactivates (unmount, or a switch to reduced
 * motion) the island restores every attribute it set, except data-center-id, which stays until unmount
 * (CENTER_CHANGE_EVENT). The live region exists in both motion modes and announces centering caused by Prev and
 * Next, swipe and wheel. It does not announce centering by the listbox keys, which aria-activedescendant already
 * speaks; centering requested by EXHIBIT_SELECT_EVENT, whose sender's aria-valuetext already speaks it; or the
 * initial exhibit.
 */
export type CoverFlowProps = {
  exhibits: ExhibitCard[];
  /** id attribute of the StageList `<ol>` this island enhances. */
  listId: string;
  initialId: string;
  lang: Lang;
  /**
   * @deprecated Inert since ADR-0011, and ignored: CoverFlow always emits CENTER_CHANGE_EVENT and never writes data-era;
   * EraToggle and /prefs.js decide the theme. Pages do not pass it. Optional only so the TASK-004 fixture pages that
   * still pass it keep compiling; it goes once no caller passes it.
   */
  eraUiEnabled?: boolean;
  /** Control and announcement strings, resolved by the page with t(); islands never import src/i18n/utils.ts. */
  labels: { prev: string; next: string; open: string };
  /**
   * For composition inside React and for tests; pages listen to CENTER_CHANGE_EVENT instead. Called whenever that
   * event is dispatched, the initial emission included. Parents may pass a new function, or new but equal props, on
   * every render: the island calls the latest callback and attaches once per listId, so it never re-centers on its own.
   */
  onCenterChange?: (id: string) => void;
};

/** One exhibit on the TimelineScrubber axis, resolved for one page language by toTimelineItem() in src/lib/timeline.ts. */
export type TimelineItem = {
  id: string;
  /** Same text as ExhibitCard.yearLabel: "1986", or "approx. 1986" in the page language. */
  yearLabel: string;
  /** Product name as the manufacturer named it at launch (never translated). */
  name: string;
  decade: Decade;
  /** The input's aria-valuetext while this exhibit is at the thumb: t(lang, 'timeline.value') with name, maker and yearLabel. */
  valueText: string;
};

/**
 * TimelineScrubber is a native `<input type="range">` with one step per exhibit, in the order of `items` (the stage's
 * order, oldest first, never wrapping; the axis is ordinal, not proportional to years), over a decorative axis that
 * groups the steps by decade. The full markup is in docs/tasks/TASK-004-timeline-scrubber.md.
 * - Server render and first client render: `<div class="timeline-scrubber" data-ready="false"></div>`. Its
 *   min-block-size reserves the attached size, so nothing moves at attach, and it is hidden under `(scripting: none)`.
 *   Nothing interactive exists without JS (the StageList and the decade pages are the static fallback). With fewer than
 *   two items it renders nothing. The stylesheet declares `--timeline-scrubber-size` on :root, the root's whole
 *   reserved block size; a sticky placement sizes its scroll padding from it.
 * - Once attached (`data-ready="true"`): the input `#<listId>-scrubber` with min="0", max={items.length - 1},
 *   step="1", aria-labelledby="<listId>-scrubber-label" (a visible, aria-hidden caption), aria-valuetext={valueText of
 *   the item at the thumb}, and aria-controls={listId} when that list exists. Everything else is aria-hidden decoration.
 *   There is no role, tabindex or aria-live attribute and no <output> anywhere, and the input is the only focusable
 *   element.
 * - The current exhibit comes from the list at attach (its data-center-id, else its data-initial-id, else the first
 *   item), then from CENTER_CHANGE_EVENT, which the scrubber follows without emitting anything. It emits
 *   EXHIBIT_SELECT_EVENT for the picks the visitor commits (rules there). It never moves focus, never scrolls, has no
 *   live region, and writes nothing in the DOM outside its own root.
 */
export type TimelineScrubberProps = {
  /** The stage's exhibits, in the stage's order (the order of the StageList items). */
  items: TimelineItem[];
  /**
   * id of the StageList `<ol>` this scrubber steers: the input's aria-controls, and where it reads data-center-id and
   * data-initial-id at attach.
   */
  listId: string;
  /** Strings resolved by the page with timelineLabels(lang) (src/lib/timeline.ts); islands never import src/i18n/utils.ts. */
  labels: {
    /** Visible caption and accessible name of the input (timeline.label). */
    label: string;
    /** Axis label of each decade (decade.<decade>). */
    decades: Record<Decade, string>;
  };
  /**
   * For composition inside React and for tests; pages listen to EXHIBIT_SELECT_EVENT instead. Called right after each
   * EXHIBIT_SELECT_EVENT the island dispatches, and never otherwise. Parents may pass a new function on every render:
   * the island calls the latest one and attaches once per listId.
   */
  onSelect?: (id: string) => void;
};

/**
 * EraToggle (src/components/EraToggle.astro; client code in src/islands/era-toggle/, no React: ADR-0011): the Era UI
 * switch in the header. The component renders every string with t() on the server; the client code never imports
 * src/i18n/utils.ts.
 * - Markup: a native `<button type="button" role="switch" aria-checked="false">` named by its visible label
 *   (era.toggle) and by nothing else; the track, which holds the thumb, is aria-hidden. Beside the button, outside
 *   it, an empty `aria-live="polite" aria-atomic="true"` region. The server always renders the off state. Until the
 *   script has applied the stored preference, the button keeps its box with visibility: hidden; the script then sets
 *   ERA_TOGGLE_HOOKS.ready on the root.
 * - Applied era (ERA_HOOKS): Era UI off is "museum". Era UI on is the era of the last valid CENTER_CHANGE_EVENT
 *   received on this page, else `html[data-page-era]`, else "museum". The toggle listens to CENTER_CHANGE_EVENT in both
 *   states and handles it synchronously.
 * - Before first paint, /prefs.js (ADR-0012) has already applied the stored state, so at init the toggle normally
 *   finds `html[data-era]` already right and does not write it: no museum-first flash and no reflow. It still reads
 *   the preference itself and writes the attribute when it differs, so a page where /prefs.js did not run ends in the
 *   same state.
 * - Persistence: STORAGE_KEYS.eraUi. Every access, including reading `window.localStorage`, is inside try/catch; when
 *   storage fails, the switch still works for the page.
 * - Announcements: only the changes the visitor makes with the switch (era.announce_*). Never the initial state; a
 *   stage-driven era change or a back/forward resync clears the region instead. The script never moves focus.
 */
export type EraToggleProps = {
  lang: Lang;
};

export type StoryFormProps = {
  exhibitId: string;
  lang: Lang;
  /** Public Turnstile site key (an identifier, not a secret). */
  turnstileSiteKey: string;
  /** "/api/stories" (Phase 3). */
  endpoint: string;
};

// ---- events between islands
// Astro cannot pass functions from a page to an island, so islands talk through DOM CustomEvents dispatched on
// `document`. Each island owns the events it emits; nobody else dispatches them.

/**
 * Emitted by CoverFlow once the centered exhibit settles (debounced 120 ms), and once after the island attaches, with
 * the initial exhibit and in both motion modes, so the header and Era UI can sync. The live region announces only the
 * centering CoverFlowProps lists, never the initial emission. Islands hydrate independently, so right before every
 * emission CoverFlow also sets `data-center-id="<id>"` on its list. It keeps the attribute in both motion modes and
 * removes it only when it unmounts. A listener that may attach later reads the current exhibit there, and reads the
 * list's `data-initial-id` while `data-center-id` is absent (TimelineScrubber does both). EraToggle needs neither: the
 * page writes the initial exhibit's era into `html[data-page-era]`.
 */
export const CENTER_CHANGE_EVENT = 'plcmuseum:center-change';
export type CenterChangeDetail = { id: string; decade: Decade; era: EraTheme };

/**
 * Emitted by TimelineScrubber when the visitor commits a pick. It is dispatched synchronously: once per keyboard or
 * assistive-technology step (PageUp and PageDown included), and once when a pointer gesture is released (pointerup).
 * A cancelled gesture (pointercancel, or blur during a drag) dispatches nothing. It is sent only for an id that differs
 * from the last one the scrubber emitted, followed or started with, and never during a drag, at attach, or when the
 * scrubber follows CENTER_CHANGE_EVENT. CoverFlow centers the exhibit (scrolls it into view under reduced motion)
 * without announcing it, and leaves focus where it is in both motion modes. The sender keeps focus (WCAG 3.2.2), and
 * screen readers speak its input's aria-valuetext as the value changes, which already names the pick, as
 * aria-activedescendant does for the listbox keys.
 */
export const EXHIBIT_SELECT_EVENT = 'plcmuseum:exhibit-select';
export type ExhibitSelectDetail = { id: string };

/**
 * Emitted by EraToggle, and by nothing else, on `document`: once when it initializes, with the state it applied
 * (whether or not that changed the attribute), then after every change of the enabled state or of `html[data-era]`,
 * synchronously right after the attribute write, so a listener reads `html[data-era] === detail.era`. A listener that
 * attaches later reads `html[data-era]` instead.
 */
export const ERA_CHANGE_EVENT = 'plcmuseum:era-change';
export type EraChangeDetail = { enabled: boolean; era: EraAttribute };

declare global {
  interface DocumentEventMap {
    [CENTER_CHANGE_EVENT]: CustomEvent<CenterChangeDetail>;
    [EXHIBIT_SELECT_EVENT]: CustomEvent<ExhibitSelectDetail>;
    [ERA_CHANGE_EVENT]: CustomEvent<EraChangeDetail>;
  }
}

// ---- persisted preferences (localStorage, every read and write wrapped in try/catch: docs/SECURITY.md 3.1)
// public/prefs.js is a classic script outside the bundle, so it repeats these keys as literals;
// tests/islands/prefs-head.test.ts keeps the two in step.

export const STORAGE_KEYS = {
  /**
   * "1" while the visitor has Era UI on; removed when they turn it off. Any other value reads as off. Written only by
   * EraToggle. Read before first paint by /prefs.js (ADR-0012), which applies `html[data-page-era]` while it is "1",
   * and by EraToggle when it initializes and on a persisted pageshow.
   */
  eraUi: 'plcmuseum:era-ui',
  /**
   * Lang of the last language link the visitor activated with a plain click; written only by LanguageSwitch. Read only
   * by /prefs.js, before first paint, on the language home the Worker's "/" redirect chose (marked `?auto`), to follow
   * the visitor's choice instead of Accept-Language (ADR-0011, ADR-0012).
   */
  lang: 'plcmuseum:lang',
} as const;

// ---- Era UI attributes on <html> (src/layouts/Base.astro, docs/ARCHITECTURE.md section 8)

export const ERA_HOOKS = {
  /**
   * EraAttribute applied now; "museum" in the server-rendered HTML. In production two scripts write it: /prefs.js,
   * before first paint, from the stored preference (ADR-0012), and EraToggle after it. FixtureSwitches writes it on
   * the /dev pages that render it, which render no EraToggle and carry no data-page-era;
   * /dev/era-toggle/<scenario> (TASK-005) renders the real header and the scenario's data-page-era (none on
   * /dev/era-toggle/none), and no FixtureSwitches.
   */
  applied: 'data-era',
  /**
   * EraTheme this page wears while Era UI is on, written only by Base.astro from its pageEra prop: the exhibit's era
   * (era_theme_override included) on an exhibit page, eraForDecade(decade) on a decade page, the first exhibit's era on
   * the home, where the stage starts. Absent on pages without one and on a home without exhibits.
   */
  page: 'data-page-era',
} as const;

// ---- EraToggle markup (src/components/EraToggle.astro) that tests and later scripts find

export const ERA_TOGGLE_HOOKS = {
  /** Class of the component's root element; one per page, in the header. */
  root: 'era-toggle',
  /**
   * Empty attribute the script sets on the root once the switch shows the stored preference. A presence flag here;
   * TimelineScrubber's data-ready is "true"/"false", so always select it together with the component's class
   * (`.era-toggle[data-ready]`), never a bare `[data-ready]`.
   */
  ready: 'data-ready',
} as const;

// ---- server-rendered language links (src/components/LanguageLinks.astro) that the LanguageSwitch script enhances
// (client code in src/islands/language-switch/, no React: ADR-0011)

export const LANGUAGE_HOOKS = {
  /** Class of the header's language `<nav>`, next to "languages"; one per page. */
  nav: 'language-switch',
  /** Attribute on each link: the Lang of the page it leads to. */
  lang: 'data-lang',
  /**
   * Empty attribute the script sets on the nav once its click listener is attached. A presence flag here;
   * TimelineScrubber's data-ready is "true"/"false", so always select it together with the component's class
   * (`.language-switch[data-ready]`), never a bare `[data-ready]`.
   */
  ready: 'data-ready',
} as const;

// ---- server-rendered stage markup (src/components/StageList.astro) that CoverFlow enhances

export const STAGE_HOOKS = {
  /**
   * `<ol>` with an id (CoverFlowProps.listId, TimelineScrubberProps.listId) and `data-initial-id`; one per page. While
   * CoverFlow is mounted it also carries `data-center-id` (see CENTER_CHANGE_EVENT).
   */
  list: 'stage-list',
  /**
   * `<li>` with `data-id`, `data-decade`, `data-era`, `data-year`; its id attribute is `stage-item-<id>`. Its link
   * `a.card` has the id `stage-link-<id>`, is named by `stage-name-<id>`, `stage-maker-<id>` and `stage-year-<id>`,
   * and is described by `stage-tagline-<id>`. The link, not the `<li>`, is the active descendant.
   */
  item: 'stage-item',
  /**
   * `<span aria-hidden="true">` first in each item, holding `year` (digits only) for the decorative watermark behind the
   * centered exhibit. Added with TASK-001 as the one owner-approved exception to "StageList markup stays" (2026-10-15).
   */
  watermark: 'stage-watermark',
  /**
   * Class on the `<ol>` of a list that a CoverFlow island is about to enhance: StageList renders it, with `is-center`
   * on the item the stage starts on, when its `coverflow` prop is set, and CoverFlow removes it when it attaches (in
   * both motion modes, and from a list it does not enhance). Under `(scripting: enabled) and (prefers-reduced-motion:
   * no-preference)` the first paint then already has the stage's block size and shows that item and its year only, so
   * hydration resizes nothing (no layout shift) and the largest paint does not wait for the island's code. Without
   * scripting, under reduced motion, and where `scripting` is unknown, it changes nothing. Added at the TASK-001
   * integration (2026-10-16).
   */
  pending: 'is-pending',
} as const;
