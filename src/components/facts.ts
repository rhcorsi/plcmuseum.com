// Exhibit facts prepared for display (SpecGrid, LifecycleDetails). A missing fact stays null so the page says
// "Not yet verified"; it is never replaced by a plausible value (docs/CONTENT_GUIDE.md section 2).
import type { Exhibit } from '../content/types';
import { LANG_TAGS, type Lang } from '../i18n/utils';

export type FactRow = {
  label: string;
  value: string | null;
  /** The curator lists this field in verification.unverified_fields: the value is shown, flagged as unverified. */
  unverified: boolean;
};

export function factFormatter(lang: Lang, exhibit: Exhibit) {
  // maximumFractionDigits 20: the default (3) would print a sourced 0.0004 ms/K scan time as "0".
  const numbers = new Intl.NumberFormat(LANG_TAGS[lang], { maximumFractionDigits: 20 });
  const lists = new Intl.ListFormat(LANG_TAGS[lang], { type: 'conjunction' });
  const flagged = new Set(exhibit.verification.unverified_fields);
  return {
    /** `path` is the field's JSON path as verification.unverified_fields spells it, e.g. "specs.cpu". */
    row: (label: string, path: string, value: string | null | undefined): FactRow => ({
      label,
      value: value ? value : null,
      unverified: flagged.has(path),
    }),
    number: (value: number | null | undefined) => (value == null ? null : numbers.format(value)),
    // Years are digits only, never grouped ("1.986" in German reads as a quantity).
    year: (value: number | null | undefined) => (value == null ? null : String(value)),
    list: (values: readonly string[] | undefined) => (values && values.length > 0 ? lists.format(values) : null),
  };
}
