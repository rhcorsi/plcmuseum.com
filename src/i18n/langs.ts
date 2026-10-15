// Languages and language routing (docs/I18N.md). No dictionaries here, so code that only needs the language list
// (Playwright specs, the Worker's drift test) can import it without loading JSON.

export const LANGS = ['pt', 'en', 'es', 'de', 'it'] as const;
export type Lang = (typeof LANGS)[number];

/** Fallback for `/` without a usable Accept-Language and the hreflang x-default target. */
export const DEFAULT_LANG: Lang = 'en';

/** BCP 47 tags for `<html lang>`, hreflang and Intl formatting. */
export const LANG_TAGS: Record<Lang, string> = { pt: 'pt-BR', en: 'en', es: 'es', de: 'de', it: 'it' };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/**
 * Site path in a language. `path` is language-neutral and starts with "/":
 * localizedPath('pt', '/') is "/pt/", localizedPath('de', '/exhibits/ab-plc-5') is "/de/exhibits/ab-plc-5".
 */
export function localizedPath(lang: Lang, path = '/'): string {
  if (!path.startsWith('/')) throw new Error(`localizedPath expects a path starting with "/", got "${path}"`);
  return path === '/' ? `/${lang}/` : `/${lang}${path}`;
}

/** The same page in every language, for hreflang links and the language switch. */
export function alternates(path: string): Record<Lang, string> {
  return Object.fromEntries(LANGS.map((lang) => [lang, localizedPath(lang, path)])) as Record<Lang, string>;
}

/**
 * Splits a site path into its language and the language-neutral rest:
 * "/pt/exhibits/ab-plc-5" gives { lang: "pt", path: "/exhibits/ab-plc-5" }; "/about" gives { lang: null, path: "/about" }.
 */
export function splitLangPath(pathname: string): { lang: Lang | null; path: string } {
  const match = /^\/([a-z]{2})(\/.*)?$/.exec(pathname);
  const candidate = match?.[1];
  if (!isLang(candidate)) return { lang: null, path: pathname };
  return { lang: candidate, path: match?.[2] ?? '/' };
}
