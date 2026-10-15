import { describe, expect, it } from 'vitest';
// Test-only reach into the site: the Worker keeps its own copy of the language list (see worker/src/language.ts).
import { DEFAULT_LANG as SITE_DEFAULT_LANG, LANGS as SITE_LANGS } from '../../src/i18n/langs';
import { DEFAULT_LANG, negotiateLanguage, SUPPORTED_LANGS } from '../src/language';

describe('negotiateLanguage', () => {
  it.each([
    ['pt-BR,pt;q=0.9,en;q=0.8', 'pt'],
    ['de-DE', 'de'],
    ['de-CH', 'de'],
    ['fr-FR,es;q=0.5', 'es'],
    ['it-CH', 'it'],
    ['en;q=0,pt;q=0.1', 'pt'],
    ['', 'en'],
    ['*', 'en'],
    ['fr-FR,*;q=0.8', 'en'],
    ['zz-ZZ, xx', 'en'],
    ['garbage', 'en'],
    [';;;,,,=q', 'en'],
    ['es;q=2', 'en'],
    ['es;q=abc,de;q=0.4', 'de'],
    ['EN-gb', 'en'],
    ['es;q=0.5,de;q=0.5', 'es'],
    ['fr, it;q=0.3, pt;q=0.7', 'pt'],
    ['es ; q=0.9 , it', 'it'],
    ['de;q=1.000,pt', 'de'],
    // A q parameter spelled any other way than "q=<quality>" makes the entry malformed, never an unweighted q=1.
    ['de;q =0.5, pt;q=0.9', 'pt'],
    ['de;q= 0.5, pt;q=0.9', 'pt'],
    ['de;Q =0.5,it;q=0.2', 'it'],
    ['de;q\t=1,es;q=0.1', 'es'],
    ['de;q=,pt;q=0.1', 'pt'],
    ['de;Q=0.5,pt;q=0.4', 'de'],
  ])('%j picks %s', (header, expected) => {
    expect(negotiateLanguage(header)).toBe(expected);
  });

  it('falls back to English without the header', () => {
    expect(negotiateLanguage(null)).toBe('en');
  });
});

describe('language list', () => {
  it('matches the languages the site is built in', () => {
    expect([...SUPPORTED_LANGS]).toEqual([...SITE_LANGS]);
    expect(DEFAULT_LANG).toBe(SITE_DEFAULT_LANG);
  });
});
