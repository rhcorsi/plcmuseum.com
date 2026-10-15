// UI strings (docs/I18N.md). Copy lives only in ./<lang>.json; en.json defines the key set and tests/i18n checks every
// other language has exactly the same keys. Language routing lives in ./langs.ts and is re-exported here.
import de from './de.json';
import en from './en.json';
import es from './es.json';
import it from './it.json';
import type { Lang } from './langs';
import pt from './pt.json';

export * from './langs';

export type UiKey = Exclude<keyof typeof en, `_${string}`>;
type Dictionary = Partial<Record<UiKey, string>> & { _status?: string };

const DICTIONARIES: Record<Lang, Dictionary> = { pt, en, es, de, it };

/**
 * UI string for `key` in `lang`, with `{name}` placeholders filled from `vars`.
 * A key missing in `lang` falls back to English; tests/i18n keeps that from happening silently.
 */
export function t(lang: Lang, key: UiKey, vars?: Record<string, string | number>): string {
  const raw = DICTIONARIES[lang][key] ?? en[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** True while a language's UI strings are machine translated (shows the "help us review" badge). */
export function isMachineTranslated(lang: Lang): boolean {
  return DICTIONARIES[lang]._status === 'machine';
}
