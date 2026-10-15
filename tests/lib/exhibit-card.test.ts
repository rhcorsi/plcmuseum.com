// The real sample exhibit, parsed by the same Zod schema the content collection uses, mapped to ExhibitCard.
import { describe, expect, it } from 'vitest';
import abPlc5 from '../../content/exhibits/ab-plc-5.json';
import { exhibitSchema } from '../../src/content/schemas';
import { silhouetteFor, textFor, toExhibitCard } from '../../src/lib/exhibit-card';

const exhibit = exhibitSchema.parse(abPlc5);

describe('ab-plc-5 as an ExhibitCard', () => {
  it('uses the Portuguese text on pt pages', () => {
    const card = toExhibitCard(exhibit, 'pt');
    expect(card.textLang).toBe('pt');
    expect(card.tagline).toBe(exhibit.text.pt.tagline);
    expect(card.alt).toBe(exhibit.text.pt.alt_text);
    expect(card.href).toBe('/pt/exhibits/ab-plc-5');
  });

  it('uses the English text on en pages', () => {
    const card = toExhibitCard(exhibit, 'en');
    expect(card.textLang).toBe('en');
    expect(card.tagline).toBe(exhibit.text.en?.tagline);
    expect(card.href).toBe('/en/exhibits/ab-plc-5');
  });

  it('falls back to English on de pages while there is no German text', () => {
    const card = toExhibitCard(exhibit, 'de');
    expect(card.textLang).toBe('en');
    expect(card.tagline).toBe(exhibit.text.en?.tagline);
    expect(card.href).toBe('/de/exhibits/ab-plc-5');
    expect(textFor(exhibit, 'de').textLang).toBe('en');
  });

  it('carries the language-neutral facts', () => {
    const card = toExhibitCard(exhibit, 'de');
    expect(card).toMatchObject({
      id: 'ab-plc-5',
      slug: 'ab-plc-5',
      name: 'PLC-5',
      manufacturer: 'Allen-Bradley',
      year: 1986,
      yearPrecision: 'approximate',
      decade: '1980s',
      era: '1980s',
      image: null,
    });
  });

  // Only the fragment is asserted: vitest's Vite inlines small `?url` imports as data URIs, while the Astro build
  // (assetsInlineLimit 0) emits a hashed same-origin file; the build check covers that part.
  it('points the silhouette at the #art element of the illustration', () => {
    const card = toExhibitCard(exhibit, 'pt');
    expect(card.silhouette?.endsWith('#art')).toBe(true);
    expect(silhouetteFor(exhibit)).toBe(card.silhouette);
  });
});
