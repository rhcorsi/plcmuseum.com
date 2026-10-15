// UI dictionaries (docs/I18N.md): en.json defines the key set; every language has exactly those keys, the same
// {placeholders}, no empty values and no em or en dashes. es, de and it stay marked "machine" until a native
// engineer reviews them; pt and en are human-verified and carry no status.
import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import es from '../../src/i18n/es.json';
import it_ from '../../src/i18n/it.json';
import pt from '../../src/i18n/pt.json';

const DICTIONARIES: Record<string, Record<string, string>> = { pt, en, es, de, it: it_ };
const MACHINE = ['es', 'de', 'it'];
const HUMAN = ['pt', 'en'];

const uiKeys = (dictionary: Record<string, string>) => Object.keys(dictionary).filter((key) => !key.startsWith('_'));
const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const enKeys = uiKeys(en).sort();

describe.each(Object.entries(DICTIONARIES))('%s.json', (lang, dictionary) => {
  it('has exactly the keys of en.json', () => {
    expect(uiKeys(dictionary).sort()).toEqual(enKeys);
  });

  it('has no empty value', () => {
    const empty = Object.entries(dictionary).filter(([, value]) => value.trim() === '');
    expect(empty).toEqual([]);
  });

  it('uses the same placeholders as en.json for every key', () => {
    const mismatched = enKeys.filter(
      (key) => placeholders(dictionary[key] ?? '').join() !== placeholders(en[key as keyof typeof en]).join(),
    );
    expect(mismatched).toEqual([]);
  });

  it('contains no em or en dash', () => {
    const dashed = Object.entries(dictionary).filter(([, value]) => /[\u2013\u2014]/.test(value));
    expect(dashed).toEqual([]);
  });

  it(`has the translation status of a ${MACHINE.includes(lang) ? 'machine' : 'human'} translation`, () => {
    if (MACHINE.includes(lang)) expect(dictionary._status).toBe('machine');
    if (HUMAN.includes(lang)) expect(dictionary).not.toHaveProperty('_status');
  });
});

describe('language endonyms', () => {
  it('are identical in every dictionary', () => {
    const endonyms = (dictionary: Record<string, string>) =>
      Object.fromEntries(Object.entries(dictionary).filter(([key]) => key.startsWith('lang.')));
    for (const dictionary of Object.values(DICTIONARIES)) {
      expect(endonyms(dictionary)).toEqual(endonyms(en));
    }
  });
});
