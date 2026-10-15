// Language negotiation for the "/" redirect (docs/I18N.md). The list mirrors LANGS in src/i18n/langs.ts; it is
// repeated because the Worker never imports from src/ (docs/ARCHITECTURE.md, dependencies point inward), and
// worker/test/language.test.ts keeps the two in step.
export const SUPPORTED_LANGS = ['pt', 'en', 'es', 'de', 'it'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';

// RFC 9110 language range and weight ("q=" and a quality value, no spaces around "="); anything else in the header
// is ignored rather than guessed at.
const LANGUAGE_RANGE = /^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/i;
const WEIGHT = /^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i;
// Any parameter that names q, however it is spelled: one that is not a valid WEIGHT ("q =0.5") makes the entry
// malformed, so it is skipped instead of being read as unweighted (q=1).
const WEIGHT_NAME = /^q\s*=/i;

function isSupported(value: string): value is Lang {
  return (SUPPORTED_LANGS as readonly string[]).includes(value);
}

/**
 * The site language for an Accept-Language header: the supported primary subtag with the highest quality, the
 * earliest one on a tie ("pt-BR" picks pt, "de-CH" picks de). Ranges with q=0, "*" and malformed entries are skipped;
 * with no match the answer is DEFAULT_LANG.
 */
export function negotiateLanguage(acceptLanguage: string | null): Lang {
  let best: Lang = DEFAULT_LANG;
  let bestQuality = 0;
  for (const entry of (acceptLanguage ?? '').split(',')) {
    const [range = '', ...params] = entry.split(';').map((part) => part.trim());
    if (!LANGUAGE_RANGE.test(range)) continue;
    const weight = params.find((param) => WEIGHT_NAME.test(param));
    if (weight !== undefined && !WEIGHT.test(weight)) continue;
    const quality = weight === undefined ? 1 : Number(weight.slice(2));
    const primary = range.split('-')[0]?.toLowerCase() ?? '';
    // Strictly greater, so the first range wins a tie.
    if (quality > bestQuality && isSupported(primary)) {
      best = primary;
      bestQuality = quality;
    }
  }
  return best;
}
