// Fixtures feed component work, dev pages and the stage tests, so they must cover what the real catalog will:
// every decade, both visuals (photo and illustration), eras that follow src/lib/era.ts, and nothing that could
// pass for a real brand.
import { describe, expect, it } from 'vitest';
import { DECADES, storySchema } from '../../src/content/schemas';
import type { FieldStory } from '../../src/content/types';
import { fixtureExhibits } from '../../src/fixtures/exhibits';
import { fixtureStories } from '../../src/fixtures/stories';
import { eraForDecade } from '../../src/lib/era';
import { ajvStory } from './ajv';

const FICTIONAL_MANUFACTURERS = ['Fixture Controls', 'Example Industrial', 'Sample Process Systems'];

describe('fixtureExhibits', () => {
  it('has 12 cards with unique ids', () => {
    expect(fixtureExhibits).toHaveLength(12);
    expect(new Set(fixtureExhibits.map((card) => card.id)).size).toBe(12);
  });

  it('covers all seven decades', () => {
    expect(new Set(fixtureExhibits.map((card) => card.decade))).toEqual(new Set(DECADES));
  });

  it('has exactly two illustration cards, each pointing at the #art symbol', () => {
    const illustrated = fixtureExhibits.filter((card) => card.image === null);
    expect(illustrated).toHaveLength(2);
    for (const card of illustrated) expect(card.silhouette, card.id).toMatch(/#art$/);
  });

  it('sets a silhouette only when there is no photo', () => {
    for (const card of fixtureExhibits) expect(card.silhouette !== null, card.id).toBe(card.image === null);
  });

  it('derives each era from the decade', () => {
    for (const card of fixtureExhibits) expect(card.era, card.id).toBe(eraForDecade(card.decade));
  });

  it('uses only the fictional manufacturers', () => {
    for (const card of fixtureExhibits) expect(FICTIONAL_MANUFACTURERS, card.id).toContain(card.manufacturer);
  });
});

describe('fixtureStories', () => {
  const exhibitIds = new Set(fixtureExhibits.map((card) => card.id));
  const stories = fixtureStories.map((story): [string, FieldStory] => [story.id, story]);

  it.each(stories)('%s is valid for Ajv and Zod', (_id, story) => {
    expect(ajvStory(story), JSON.stringify(ajvStory.errors)).toBe(true);
    expect(storySchema.safeParse(story).success).toBe(true);
  });

  it.each(stories)('%s references a fixture exhibit', (_id, story) => {
    expect(exhibitIds).toContain(story.exhibit_id);
  });
});
