// t() falls back to English for a key missing in a language. The real dictionaries are complete (tests/i18n), so
// this file swaps pt.json for an incomplete one; vi.mock is file-scoped and leaves the other tests untouched.
import { describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n/utils';

vi.mock('../../src/i18n/pt.json', () => ({ default: { 'site.name': 'Museu de teste' } }));

describe('t fallback', () => {
  it('uses the language string when present', () => {
    expect(t('pt', 'site.name')).toBe('Museu de teste');
  });

  it('falls back to English when the key is missing', () => {
    expect(t('pt', 'nav.skip')).toBe('Skip to content');
    expect(t('pt', 'year.approximate', { year: 1974 })).toBe('approx. 1974');
  });
});
