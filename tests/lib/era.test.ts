import { describe, expect, it } from 'vitest';
import { DECADES } from '../../src/content/schemas';
import { ERA_THEMES, eraForDecade, isEraAttribute, MUSEUM_ERA } from '../../src/lib/era';

describe('eraForDecade', () => {
  it('maps every decade to one of the five themes', () => {
    expect(DECADES.map((decade) => eraForDecade(decade))).toEqual([
      '1970s',
      '1970s',
      '1980s',
      '1990s',
      '2000s',
      '2020s',
      '2020s',
    ]);
  });

  it('prefers the override decade when one is set', () => {
    expect(eraForDecade('1990s', '1980s')).toBe('1980s');
    expect(eraForDecade('2010s', '1960s')).toBe('1970s');
  });

  it('ignores a null or missing override', () => {
    expect(eraForDecade('1980s', null)).toBe('1980s');
    expect(eraForDecade('1980s', undefined)).toBe('1980s');
  });
});

describe('isEraAttribute', () => {
  it('accepts the museum theme and the five era themes', () => {
    expect(isEraAttribute(MUSEUM_ERA)).toBe(true);
    for (const era of ERA_THEMES) expect(isEraAttribute(era)).toBe(true);
  });

  it('rejects decades without a theme and anything else', () => {
    for (const value of ['1960s', '2010s', 'Museum', '', null, undefined, 1980]) {
      expect(isEraAttribute(value)).toBe(false);
    }
  });
});
