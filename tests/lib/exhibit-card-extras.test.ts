// The ExhibitCard fields added after the first review: the localized year label and the generic illustration table.
import { describe, expect, it } from 'vitest';
import abPlc5 from '../../content/exhibits/ab-plc-5.json';
import { exhibitSchema } from '../../src/content/schemas';
import {
  GENERIC_ILLUSTRATION_BY_ARCHITECTURE,
  GENERIC_ILLUSTRATION_BY_CATEGORY,
  silhouetteFor,
  toExhibitCard,
  yearLabelFor,
} from '../../src/lib/exhibit-card';

const exhibit = exhibitSchema.parse(abPlc5);

// The first batch of names in docs/tasks/TASK-003-silhouettes.md.
const TASK_003_NAMES = [
  'rack-modular',
  'rack-dcs-cabinet',
  'compact-plc',
  'micro-plc',
  'cpu-module',
  'programming-terminal-crt',
  'programming-case',
  'operator-console-crt',
  'multiloop-controller',
  'io-remote-rack',
];

describe('yearLabel', () => {
  it('is the bare year when the precision is exact', () => {
    expect(yearLabelFor('de', 1986, 'exact')).toBe('1986');
  });

  it('carries the localized approx. label otherwise, without digit grouping', () => {
    expect(yearLabelFor('en', 1986, 'approximate')).toBe('approx. 1986');
    expect(yearLabelFor('de', 1986, 'disputed')).not.toContain('1.986');
    expect(yearLabelFor('de', 1986, 'disputed')).toContain('1986');
  });

  it('is set on the card in the page language', () => {
    expect(toExhibitCard(exhibit, 'en').yearLabel).toBe('approx. 1986');
    expect(toExhibitCard(exhibit, 'pt').yearLabel).toBe(yearLabelFor('pt', 1986, 'approximate'));
  });
});

describe('generic illustrations', () => {
  it('only name files TASK-003 delivers', () => {
    const names = [
      ...Object.values(GENERIC_ILLUSTRATION_BY_CATEGORY),
      ...Object.values(GENERIC_ILLUSTRATION_BY_ARCHITECTURE),
    ];
    expect(names.filter((name) => !TASK_003_NAMES.includes(name ?? ''))).toEqual([]);
  });

  it('never replace an illustration the exhibit has of its own', () => {
    expect(silhouetteFor(exhibit)).toMatch(/#art$/);
  });

  it('give null while TASK-003 has not delivered the file', () => {
    const bare = { ...exhibit, images: [] };
    // src/assets/illustrations holds no SVG yet; once rack-modular.svg exists this becomes a "#art" reference.
    const result = silhouetteFor(bare);
    expect(result === null || result.endsWith('#art')).toBe(true);
  });
});
