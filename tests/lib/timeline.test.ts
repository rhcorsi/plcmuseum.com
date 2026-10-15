// TimelineScrubber props (src/lib/timeline.ts): the items carry the page language's year label and the slider's
// aria-valuetext, and the labels carry every decade in every language.
import { describe, expect, it } from 'vitest';
import { DECADES } from '../../src/content/schemas';
import { fixtureExhibits } from '../../src/fixtures/exhibits';
import { LANGS } from '../../src/i18n/langs';
import type { ExhibitCard } from '../../src/islands/contracts';
import { yearLabelFor } from '../../src/lib/exhibit-card';
import { timelineLabels, toTimelineItem } from '../../src/lib/timeline';

function fixtureCard(id: string): ExhibitCard {
  const card = fixtureExhibits.find((candidate) => candidate.id === id);
  if (!card) throw new Error(`fixture card ${id} not found`);
  return card;
}

describe('toTimelineItem', () => {
  it('names the exhibit, its maker and its year in valueText', () => {
    const item = toTimelineItem(fixtureCard('fx-octal-rack-or5'), 'en');
    expect(item).toEqual({
      id: 'fx-octal-rack-or5',
      yearLabel: '1984',
      name: 'Octal Rack OR-5',
      decade: '1980s',
      valueText: 'Octal Rack OR-5, Fixture Controls, 1984',
    });
  });

  it('keeps the approximate year label of the card', () => {
    const item = toTimelineItem(fixtureCard('fx-logic-cabinet-lc20'), 'en');
    expect(item.yearLabel).toBe('approx. 1974');
    expect(item.valueText).toBe('Logic Cabinet LC-20, Example Industrial, approx. 1974');
  });

  it('uses the year label of a card resolved for the page language', () => {
    // The fixture cards are English, so the Portuguese card is built here as toExhibitCard(exhibit, 'pt') would.
    const card = fixtureCard('fx-logic-cabinet-lc20');
    const ptCard = { ...card, yearLabel: yearLabelFor('pt', card.year, card.yearPrecision) };
    const item = toTimelineItem(ptCard, 'pt');
    expect(item.yearLabel).toBe(ptCard.yearLabel);
    expect(item.valueText).toContain('aprox. 1974');
  });
});

describe('timelineLabels', () => {
  it('resolves the Portuguese caption and decade names', () => {
    const labels = timelineLabels('pt');
    expect(labels.label).toBe('Linha do tempo das peças');
    expect(labels.decades['1980s']).toBe('anos 1980');
  });

  it.each(LANGS)('carries every decade in %s', (lang) => {
    const labels = timelineLabels(lang);
    expect(Object.keys(labels.decades).sort()).toEqual([...DECADES].sort());
    for (const decade of DECADES) expect(labels.decades[decade], decade).not.toBe('');
    expect(labels.label).not.toBe('');
  });
});
