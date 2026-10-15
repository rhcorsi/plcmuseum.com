// Maps a content exhibit to the ExhibitCard contract for one page language (content -> presentation, never back).
import type { Exhibit, TextBlock } from '../content/types';
import { LANGS, type Lang, localizedPath, t } from '../i18n/utils';
import type { ExhibitCard } from '../islands/contracts';
import { eraForDecade } from './era';

// Illustrations are SVGs; Vite copies each to a hashed same-origin URL at build time. Files no built page
// references are pruned from the output by the build integration in astro.config.mjs.
const EXHIBIT_SVG_URLS = import.meta.glob<string>('/content/images/**/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});
const GENERIC_SVG_URLS = import.meta.glob<string>('/src/assets/illustrations/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});

/**
 * Generic illustration (docs/tasks/TASK-003-silhouettes.md) for an exhibit without an illustration of its own:
 * by category first (the device is a console or a programmer whatever its architecture), then by architecture.
 */
export const GENERIC_ILLUSTRATION_BY_CATEGORY: Partial<Record<Exhibit['category'], string>> = {
  hmi: 'operator-console-crt',
  programmer: 'programming-terminal-crt',
  multiloop: 'multiloop-controller',
  dcs: 'rack-dcs-cabinet',
};
export const GENERIC_ILLUSTRATION_BY_ARCHITECTURE: Partial<Record<Exhibit['architecture'], string>> = {
  modular: 'rack-modular',
  pac: 'rack-modular',
  compact: 'compact-plc',
  micro: 'micro-plc',
  dcs_redundant: 'rack-dcs-cabinet',
  multiloop: 'multiloop-controller',
  terminal: 'programming-terminal-crt',
};

/** Text block for `lang`, falling back to English and then Portuguese (the masters) while a translation is missing. */
export function textFor(exhibit: Exhibit, lang: Lang): { text: TextBlock; textLang: Lang } {
  const order: Lang[] = [lang, 'en', 'pt'];
  for (const candidate of order) {
    const text = exhibit.text[candidate];
    if (text) return { text, textLang: candidate };
  }
  // The schema requires text.pt, so this only runs on data that skipped validation.
  throw new Error(`exhibit "${exhibit.id}" has no text block in ${LANGS.join(', ')}`);
}

/** Readable year: "1986", or "approx. 1986" in the page language when the precision is not exact. */
export function yearLabelFor(lang: Lang, year: number, precision: Exhibit['year_introduced_precision']): string {
  return precision === 'exact' ? String(year) : t(lang, 'year.approximate', { year });
}

/** `<use>` reference for the exhibit's illustration: its own, else the generic one for its kind, else null. */
export function silhouetteFor(exhibit: Exhibit): string | null {
  const own = exhibit.images.find((image) => image.is_illustration && image.file.endsWith('.svg'));
  if (own) {
    const url = EXHIBIT_SVG_URLS[`/${own.file}`];
    if (!url) throw new Error(`exhibit "${exhibit.id}": ${own.file} is not under content/images`);
    return `${url}#art`;
  }
  const name =
    GENERIC_ILLUSTRATION_BY_CATEGORY[exhibit.category] ?? GENERIC_ILLUSTRATION_BY_ARCHITECTURE[exhibit.architecture];
  const generic = name ? GENERIC_SVG_URLS[`/src/assets/illustrations/${name}.svg`] : undefined;
  return generic ? `${generic}#art` : null;
}

export function toExhibitCard(exhibit: Exhibit, lang: Lang): ExhibitCard {
  const { text, textLang } = textFor(exhibit, lang);
  return {
    id: exhibit.id,
    slug: exhibit.slug,
    href: localizedPath(lang, `/exhibits/${exhibit.slug}`),
    name: exhibit.name,
    manufacturer: exhibit.manufacturer,
    year: exhibit.year_introduced,
    yearPrecision: exhibit.year_introduced_precision,
    yearLabel: yearLabelFor(lang, exhibit.year_introduced, exhibit.year_introduced_precision),
    decade: exhibit.decade,
    era: eraForDecade(exhibit.decade, exhibit.era_theme_override),
    tagline: text.tagline,
    textLang,
    alt: text.alt_text,
    // Licensed photos need the images:process pipeline (Phase 2) for srcset, dimensions and the credit line from
    // the sidecar; until then the stage shows the illustration.
    image: null,
    silhouette: silhouetteFor(exhibit),
  };
}
