// The stage's first paint (StageList's coverflow prop, STAGE_HOOKS.pending): hold the CoverFlow module so a test
// measures the server-rendered stage, then let the island hydrate on the same page and measure again.
import { expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    stageFrames?: { stop: boolean; frames: { visibility: string; yearOpacity: string; yearDisplay: string }[] };
  }
}

/** astro dev (the "pages" project) serves the island's module at its source path. */
const COVERFLOW_MODULE = /\/src\/islands\/CoverFlow\.tsx(\?|$)/;

type Box = { top: number; left: number; width: number; height: number };

/**
 * Holds the CoverFlow module from the next navigation on, until the returned function releases it. The returned
 * `held()` says whether the page asked for it: a pattern that stopped matching would let the island hydrate before
 * the "first paint" is measured, and every comparison would pass for the wrong reason.
 */
export async function holdCoverFlow(page: Page) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(COVERFLOW_MODULE, async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  return { held: () => requested, release };
}

/** Boxes of #stage, of the item `id` and of its decorative year after the next paint, rounded to 1/100 px. */
export async function measureStage(page: Page, id: string) {
  return page.evaluate(async (itemId) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      const round = (value: number) => Math.round(value * 100) / 100;
      return { top: round(rect.top), left: round(rect.left), width: round(rect.width), height: round(rect.height) };
    };
    const stage = document.getElementById('stage')!;
    const item = document.getElementById(`stage-item-${itemId}`)!;
    const year = item.querySelector('.stage-watermark')!;
    return {
      enhanced: stage.getAttribute('role') === 'listbox',
      stage: box(stage),
      item: { ...box(item), visibility: getComputedStyle(item).visibility },
      year: { ...box(year), opacity: getComputedStyle(year).opacity },
      visibleIds: [...stage.querySelectorAll<HTMLElement>('.stage-item')]
        .filter((element) => getComputedStyle(element).visibility === 'visible')
        .map((element) => element.dataset.id),
    };
  }, id);
}

/** Records, on every frame until stopFrames(), whether the item `id` and its year are painted. */
export async function recordFrames(page: Page, id: string) {
  await page.evaluate((itemId) => {
    const recording = { stop: false, frames: [] as NonNullable<Window['stageFrames']>['frames'] };
    window.stageFrames = recording;
    const probe = () => {
      const item = document.getElementById(`stage-item-${itemId}`)!;
      const year = getComputedStyle(item.querySelector('.stage-watermark')!);
      recording.frames.push({
        visibility: getComputedStyle(item).visibility,
        yearOpacity: year.opacity,
        yearDisplay: year.display,
      });
      if (!recording.stop) requestAnimationFrame(probe);
    };
    requestAnimationFrame(probe);
  }, id);
}

export async function stopFrames(page: Page) {
  const frames = await page.evaluate(() => {
    window.stageFrames!.stop = true;
    return window.stageFrames!.frames;
  });
  expect(frames.length).toBeGreaterThan(0);
  return frames;
}
