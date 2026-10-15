// Spec values are sourced facts: the formatter must never round them away.
import { describe, expect, it } from 'vitest';
import abPlc5 from '../../content/exhibits/ab-plc-5.json';
import { factFormatter } from '../../src/components/facts';
import { exhibitSchema } from '../../src/content/schemas';

const exhibit = exhibitSchema.parse(abPlc5);

describe('factFormatter().number', () => {
  it('keeps every decimal of a sourced value', () => {
    expect(factFormatter('en', exhibit).number(0.0004)).toBe('0.0004');
    expect(factFormatter('en', exhibit).number(0.0625)).toBe('0.0625');
    expect(factFormatter('de', exhibit).number(0.0625)).toBe('0,0625');
  });

  it('formats integers in the page language and keeps null as null', () => {
    expect(factFormatter('de', exhibit).number(2048)).toBe('2.048');
    expect(factFormatter('en', exhibit).number(null)).toBeNull();
  });
});
