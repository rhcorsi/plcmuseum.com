import { describe, expect, it } from 'vitest';
import type { Exhibit } from '../../src/content/types';
import { isVisible, resolveStage, type Stage } from '../../src/lib/stage';

describe('resolveStage', () => {
  it('defaults to development under astro dev and production for any build', () => {
    expect(resolveStage(undefined, true)).toBe('development');
    expect(resolveStage(undefined, false)).toBe('production');
    expect(resolveStage('', true)).toBe('development');
    expect(resolveStage('', false)).toBe('production');
  });

  it('takes an explicit stage over the default', () => {
    expect(resolveStage('preview', false)).toBe('preview');
    expect(resolveStage('production', true)).toBe('production');
    expect(resolveStage('development', false)).toBe('development');
  });

  it('throws on an unknown stage instead of guessing', () => {
    expect(() => resolveStage('prod', false)).toThrow(/PLCMUSEUM_STAGE must be one of/);
    expect(() => resolveStage('Production', true)).toThrow();
  });
});

describe('isVisible', () => {
  const matrix: [Exhibit['review_status'], Stage, boolean][] = [
    ['published', 'production', true],
    ['published', 'preview', true],
    ['published', 'development', true],
    ['review', 'production', false],
    ['review', 'preview', true],
    ['review', 'development', true],
    ['draft', 'production', false],
    ['draft', 'preview', false],
    ['draft', 'development', true],
  ];

  it.each(matrix)('%s on %s is %s', (status, stage, expected) => {
    expect(isVisible(status, stage)).toBe(expected);
  });
});
