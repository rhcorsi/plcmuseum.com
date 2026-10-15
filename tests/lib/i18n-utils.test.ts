import { describe, expect, it } from 'vitest';
import {
  alternates,
  DEFAULT_LANG,
  isLang,
  isMachineTranslated,
  LANGS,
  localizedPath,
  splitLangPath,
  t,
} from '../../src/i18n/utils';

describe('localizedPath', () => {
  it('prefixes the language and keeps the home trailing slash', () => {
    expect(localizedPath('pt', '/')).toBe('/pt/');
    expect(localizedPath('en')).toBe('/en/');
    expect(localizedPath('de', '/exhibits/ab-plc-5')).toBe('/de/exhibits/ab-plc-5');
  });

  it('refuses a path without a leading slash', () => {
    expect(() => localizedPath('en', 'about')).toThrow(/starting with "\/"/);
  });
});

describe('alternates', () => {
  it('gives the same page in every language', () => {
    expect(alternates('/about')).toEqual({
      pt: '/pt/about',
      en: '/en/about',
      es: '/es/about',
      de: '/de/about',
      it: '/it/about',
    });
    expect(Object.keys(alternates('/'))).toEqual([...LANGS]);
  });
});

describe('splitLangPath', () => {
  it('splits a localized path into language and neutral path', () => {
    expect(splitLangPath('/pt/exhibits/ab-plc-5')).toEqual({ lang: 'pt', path: '/exhibits/ab-plc-5' });
    expect(splitLangPath('/de/')).toEqual({ lang: 'de', path: '/' });
    expect(splitLangPath('/it')).toEqual({ lang: 'it', path: '/' });
  });

  it('returns a null language for paths outside the five languages', () => {
    expect(splitLangPath('/about')).toEqual({ lang: null, path: '/about' });
    expect(splitLangPath('/fr/about')).toEqual({ lang: null, path: '/fr/about' });
    expect(splitLangPath('/ptx/about')).toEqual({ lang: null, path: '/ptx/about' });
    expect(splitLangPath('/')).toEqual({ lang: null, path: '/' });
  });
});

describe('t', () => {
  it('reads the string of the page language', () => {
    expect(t('en', 'nav.skip')).toBe('Skip to content');
    expect(t('pt', 'nav.skip')).toBe('Pular para o conteúdo');
  });

  it('fills {placeholders} and leaves unknown ones visible', () => {
    expect(t('en', 'year.approximate', { year: 1986 })).toBe('approx. 1986');
    expect(t('pt', 'year.approximate', { year: '1986' })).toBe('aprox. 1986');
    expect(t('en', 'year.approximate', { decade: 'x' })).toBe('approx. {year}');
    expect(t('en', 'year.approximate')).toBe('approx. {year}');
  });
});

describe('language helpers', () => {
  it('recognizes the five languages only', () => {
    for (const lang of LANGS) expect(isLang(lang)).toBe(true);
    expect(isLang('fr')).toBe(false);
    expect(isLang(undefined)).toBe(false);
    expect(DEFAULT_LANG).toBe('en');
  });

  it('flags machine-translated UI languages', () => {
    expect(isMachineTranslated('en')).toBe(false);
    expect(isMachineTranslated('pt')).toBe(false);
    expect(isMachineTranslated('es')).toBe(true);
    expect(isMachineTranslated('de')).toBe(true);
    expect(isMachineTranslated('it')).toBe(true);
  });
});
