// Build-time reads of the content collections. Pages go through these helpers so the publication rules live in
// one place: stage visibility for exhibits, and the fixture fallback for stories.
import { getCollection } from 'astro:content';
import { fixtureStories } from '../fixtures/stories';
import { currentStage, isVisible } from '../lib/stage';
import type { Exhibit, FieldStory } from './types';

/** Exhibits this build may show, oldest first (ties by name). */
export async function getVisibleExhibits(): Promise<Exhibit[]> {
  const stage = currentStage();
  const entries = await getCollection('exhibits', (entry) => isVisible(entry.data.review_status, stage));
  return entries
    .map((entry) => entry.data)
    .sort((a, b) => a.year_introduced - b.year_introduced || a.name.localeCompare(b.name));
}

/**
 * Approved stories for an exhibit, oldest memory first. The deploy-time cache (ADR-0008) is the only real source;
 * fictional fixtures fill in on a developer machine and never reach a preview or production build.
 */
export async function getStoriesFor(exhibitId: string): Promise<FieldStory[]> {
  const cached = (await getCollection('stories')).map((entry) => entry.data);
  const pool = cached.length === 0 && currentStage() === 'development' ? fixtureStories : cached;
  return pool
    .filter((story) => story.exhibit_id === exhibitId)
    .sort((a, b) => (a.year_of_memory ?? 0) - (b.year_of_memory ?? 0));
}
