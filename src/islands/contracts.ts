// Props and events of the React islands (docs/DESIGN_SYSTEM.md section 3). This file is the contract the task
// files in docs/tasks/ point to: islands implement it, pages and src/lib/exhibit-card.ts produce it.
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
 * While the stage is active the list is a listbox driven by aria-activedescendant. Each option is named
 * "name, manufacturer, yearLabel", and the link inside it leaves the accessibility tree and the tab order
 * (aria-hidden="true", tabindex="-1") so no interactive control is nested in an option. Enter, a click on the centered
 * option (also the click assistive technology sends to the option) and the island's Open link all follow that link;
 * the Open link names the centered exhibit through aria-describedby.
 */
export type CoverFlowProps = {
  exhibits: ExhibitCard[];
  /** id attribute of the StageList `<ol>` this island enhances. */
  listId: string;
  initialId: string;
  lang: Lang;
  eraUiEnabled: boolean;
  /** Control and announcement strings, resolved by the page with t(); islands never import src/i18n/utils.ts. */
  labels: { prev: string; next: string; open: string };
  /**
   * For composition inside React and for tests; pages listen to CENTER_CHANGE_EVENT instead. Parents may pass a new
   * function on every render: the island calls the latest one and never re-attaches because of it.
   */
  onCenterChange?: (id: string) => void;
};

export type TimelineItem = { id: string; year: number; decade: Decade };

export type TimelineScrubberProps = {
  items: TimelineItem[];
  centerId: string;
  /** For composition inside React and for tests; pages listen to EXHIBIT_SELECT_EVENT instead. */
  onSelect?: (id: string) => void;
};

export type EraToggleProps = {
  initial: boolean;
  currentDecade: Decade;
};

export type LanguageSwitchProps = {
  current: Lang;
  /** Same page in every language (see alternates() in src/i18n/utils.ts). */
  alternates: Record<Lang, string>;
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
 * the initial exhibit and in both motion modes, so the header and Era UI can sync. Only centering the visitor causes is
 * announced in the live region; the initial emission is not.
 */
export const CENTER_CHANGE_EVENT = 'plcmuseum:center-change';
export type CenterChangeDetail = { id: string; decade: Decade; era: EraTheme };

/**
 * Emitted by TimelineScrubber when the visitor picks an exhibit. CoverFlow centers it (scrolls it into view under
 * reduced motion) and leaves focus where it is in both motion modes: the sender keeps focus (WCAG 3.2.2).
 */
export const EXHIBIT_SELECT_EVENT = 'plcmuseum:exhibit-select';
export type ExhibitSelectDetail = { id: string };

/** Emitted by EraToggle after it changes `html[data-era]`. */
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

export const STORAGE_KEYS = {
  /** "1" when the visitor turned Era UI on. */
  eraUi: 'plcmuseum:era-ui',
  /** Last language the visitor chose in LanguageSwitch. */
  lang: 'plcmuseum:lang',
} as const;

// ---- server-rendered stage markup (src/components/StageList.astro) that CoverFlow enhances

export const STAGE_HOOKS = {
  /** `<ol>` with an id (CoverFlowProps.listId) and `data-initial-id`; one per page. */
  list: 'stage-list',
  /** `<li>` with `data-id`, `data-decade`, `data-era`, `data-year`; its id attribute is `stage-item-<id>`. */
  item: 'stage-item',
  /**
   * `<span aria-hidden="true">` first in each item, holding `year` (digits only) for the decorative watermark behind the
   * centered exhibit. Added with TASK-001 as the one owner-approved exception to "StageList markup stays" (2026-10-15).
   */
  watermark: 'stage-watermark',
} as const;
