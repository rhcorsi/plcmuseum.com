// The home with the CoverFlow island over its StageList (TASK-001 integration), against `astro dev` (project "pages"),
// whose development stage shows the draft exhibits. Written for any number of cards from one up: the stage mounts from
// one exhibit, with Prev and Next disabled below two.
import { expect, type Page, test } from '@playwright/test';
import en from '../../src/i18n/en.json' with { type: 'json' };
import { CENTER_CHANGE_EVENT, type CenterChangeDetail, ERA_HOOKS, STAGE_HOOKS } from '../../src/islands/contracts';
import { holdCoverFlow, measureStage, recordFrames, stopFrames } from './helpers/stage';

declare global {
  interface Window {
    homeStageTest: {
      centers: { id: string; at: number }[];
      layoutShifts: { value: number; sources: string[] }[];
      largestPaints: { at: number; node: string }[];
    };
  }
}

const HOME = '/en/';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Records CENTER_CHANGE_EVENT, layout shifts without recent input and largest-paint candidates from the first byte. */
async function recordHome(page: Page, reducedMotion: 'reduce' | 'no-preference') {
  await page.emulateMedia({ reducedMotion });
  await page.addInitScript((eventName) => {
    const seen: Window['homeStageTest'] = { centers: [], layoutShifts: [], largestPaints: [] };
    window.homeStageTest = seen;
    const describe = (node: Node | null | undefined) =>
      node instanceof Element ? [node.localName, ...node.classList].join('.') : String(node?.nodeName);
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
          sources: { node?: Node }[];
        };
        if (!shift.hadRecentInput)
          seen.layoutShifts.push({ value: shift.value, sources: shift.sources.map(({ node }) => describe(node)) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        const paint = entry as PerformanceEntry & { element: Element | null };
        seen.largestPaints.push({ at: paint.startTime, node: describe(paint.element) });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    document.addEventListener(eventName, (event) => {
      seen.centers.push({ id: (event as CustomEvent<CenterChangeDetail>).detail.id, at: performance.now() });
    });
  }, CENTER_CHANGE_EVENT);
}

/** Waits for the island's initial event for the first card: the positive signal that it attached, in both motion modes. */
async function expectAttached(page: Page, firstId: string) {
  await expect
    .poll(async () => (await page.evaluate(() => window.homeStageTest.centers)).map(({ id }) => id))
    .toEqual([firstId]);
  await expect(page.locator('#stage')).toHaveAttribute('data-center-id', firstId);
}

async function openHome(page: Page, reducedMotion: 'reduce' | 'no-preference') {
  await recordHome(page, reducedMotion);
  const response = await page.goto(HOME);
  expect(response?.status()).toBe(200);
  const items = page.locator(`#stage.${STAGE_HOOKS.list} .${STAGE_HOOKS.item}`);
  expect(await items.count(), 'the development stage shows at least the draft sample exhibit').toBeGreaterThan(0);
  const firstId = (await items.first().getAttribute('data-id')) ?? '';
  await expectAttached(page, firstId);
  return { items, firstId, count: await items.count() };
}

test.describe('home stage', () => {
  test('hydrates the stage on the first card with no console error', async ({ page }) => {
    const errors = trackErrors(page);
    const { items, firstId, count } = await openHome(page, 'no-preference');
    const stage = page.getByRole('listbox', { name: en['home.stage_label'], exact: true });
    await expect(stage).toHaveAttribute('aria-activedescendant', `stage-link-${firstId}`);
    await expect(page.locator(`#stage-link-${firstId}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('option', { includeHidden: true })).toHaveCount(count);
    await expect(page.locator(`#stage-item-${firstId}`)).toHaveClass(/\bis-center\b/);
    await expect(page.locator(`#stage-item-${firstId}`)).toBeVisible();
    // The page era is the era the stage starts on.
    await expect(page.locator('html')).toHaveAttribute(ERA_HOOKS.page, (await items.first().getAttribute('data-era'))!);
    const open = page.getByRole('link', { name: en['stage.open'], exact: true });
    await expect(open).toHaveAttribute('href', (await page.locator(`#stage-link-${firstId}`).getAttribute('href'))!);
    for (const name of [en['stage.prev'], en['stage.next']]) {
      const control = page.getByRole('button', { name, exact: true });
      if (count < 2) await expect(control).toBeDisabled();
      else await expect(control).toBeEnabled();
    }
    // The keys move to the next card, or keep the only one selected.
    await stage.focus();
    await page.keyboard.press('ArrowRight');
    const nextId = (await items.nth(1 % count).getAttribute('data-id')) ?? '';
    await expect(stage).toHaveAttribute('aria-activedescendant', `stage-link-${nextId}`);
    expect(errors).toEqual([]);
  });

  // Taller windows and portrait tablets show what follows the stage (the footer) at first paint: a stage whose size
  // changes at hydration moves it there, so no layout shift is allowed at all, wherever its source.
  for (const viewport of [
    { width: 390, height: 900 },
    { width: 1280, height: 900 },
    { width: 1280, height: 1200 },
    { width: 820, height: 1180 },
  ]) {
    test(`has no layout shift at ${viewport.width}x${viewport.height} once images load and hydration settles`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openHome(page, 'no-preference');
      await expect(page.locator('#stage')).not.toHaveClass(/\bis-initializing\b/);
      await page.locator('#stage img').evaluateAll(async (images) => {
        await Promise.all(
          images.map(async (element) => {
            const image = element as HTMLImageElement;
            image.loading = 'eager';
            await image.decode();
          }),
        );
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1000);
      expect(await page.evaluate(() => window.homeStageTest.layoutShifts)).toEqual([]);
    });
  }

  // At this size the centered year is the largest paint above the fold. It belongs to the server-rendered first paint
  // (StageList's coverflow prop), as does the stage's hydrated size, so the largest contentful paint never waits for
  // the island's code and hydration moves nothing.
  test('the first paint already has the stage geometry and the centered year at 1280x800', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await recordHome(page, 'no-preference');
    const island = await holdCoverFlow(page);
    expect((await page.goto(HOME))?.status()).toBe(200);
    const firstId = (await page.locator(`#stage .${STAGE_HOOKS.item}`).first().getAttribute('data-id')) ?? '';
    const firstPaint = await measureStage(page, firstId);
    expect(island.held(), 'the CoverFlow module was held').toBe(true);
    expect(firstPaint).toMatchObject({ enhanced: false, item: { visibility: 'visible' }, year: { opacity: '1' } });
    expect(firstPaint.visibleIds).toEqual([firstId]);
    expect(firstPaint.year.height).toBeGreaterThan(0);
    await recordFrames(page, firstId);
    island.release();
    await expectAttached(page, firstId);
    await expect(page.locator('#stage')).not.toHaveClass(/\bis-initializing\b/);
    const hydrated = await measureStage(page, firstId);
    expect(hydrated.enhanced).toBe(true);
    expect({ stage: hydrated.stage, item: hydrated.item, year: hydrated.year }).toEqual({
      stage: firstPaint.stage,
      item: firstPaint.item,
      year: firstPaint.year,
    });
    const blinks = (await stopFrames(page)).filter(
      (frame) => frame.visibility !== 'visible' || frame.yearOpacity !== '1' || frame.yearDisplay !== 'block',
    );
    expect(blinks, 'frames where the centered card or its year was not painted').toEqual([]);
    const { centers, largestPaints, layoutShifts } = await page.evaluate(() => window.homeStageTest);
    expect(largestPaints.length).toBeGreaterThan(0);
    for (const paint of largestPaints) {
      expect(paint.at, `${paint.node} was painted after the island attached`).toBeLessThan(centers[0]!.at);
    }
    expect(layoutShifts).toEqual([]);
  });

  test('under reduced motion the static list stays', async ({ page }) => {
    const errors = trackErrors(page);
    const { items, count } = await openHome(page, 'reduce');
    const stage = page.locator('#stage');
    await expect(stage).not.toHaveAttribute('role');
    await expect(stage).not.toHaveAttribute('aria-activedescendant');
    await expect(stage).not.toHaveClass(/\bis-coverflow\b/);
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(page.getByRole('list', { name: en['home.stage_label'], exact: true })).toBeVisible();
    await expect(stage.locator('a.card')).toHaveCount(count);
    expect(
      await items.evaluateAll((nodes) =>
        nodes.every((item) => {
          const link = item.querySelector<HTMLAnchorElement>('a.card');
          return (
            !item.hasAttribute('style') &&
            !item.hasAttribute('role') &&
            getComputedStyle(item).transform === 'none' &&
            getComputedStyle(item).visibility === 'visible' &&
            !link?.hasAttribute('role') &&
            link?.tabIndex === 0
          );
        }),
      ),
    ).toBe(true);
    await expect(page.getByRole('button', { name: en['stage.next'], exact: true })).toBeHidden();
    expect(errors).toEqual([]);
  });
});
