// The home with the CoverFlow island over its StageList (TASK-001 integration), against `astro dev` (project "pages"),
// whose development stage shows the draft exhibits. Written for any number of cards from one up: the stage mounts from
// one exhibit, with Prev and Next disabled below two.
import { expect, type Page, test } from '@playwright/test';
import en from '../../src/i18n/en.json' with { type: 'json' };
import { CENTER_CHANGE_EVENT, type CenterChangeDetail, ERA_HOOKS, STAGE_HOOKS } from '../../src/islands/contracts';

declare global {
  interface Window {
    homeStageTest: { centers: string[]; layoutShifts: number[] };
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

/** Opens the home recording CENTER_CHANGE_EVENT ids and layout shifts without recent input, from the first byte. */
async function openHome(page: Page, reducedMotion: 'reduce' | 'no-preference') {
  await page.emulateMedia({ reducedMotion });
  await page.addInitScript((eventName) => {
    const seen: Window['homeStageTest'] = { centers: [], layoutShifts: [] };
    window.homeStageTest = seen;
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
        if (!shift.hadRecentInput) seen.layoutShifts.push(shift.value);
      }
    }).observe({ type: 'layout-shift', buffered: true });
    document.addEventListener(eventName, (event) => {
      seen.centers.push((event as CustomEvent<CenterChangeDetail>).detail.id);
    });
  }, CENTER_CHANGE_EVENT);
  const response = await page.goto(HOME);
  expect(response?.status()).toBe(200);
  const items = page.locator(`#stage.${STAGE_HOOKS.list} .${STAGE_HOOKS.item}`);
  expect(await items.count(), 'the development stage shows at least the draft sample exhibit').toBeGreaterThan(0);
  const firstId = (await items.first().getAttribute('data-id')) ?? '';
  // The positive signal that the island attached, in both motion modes: its initial event, for the first card.
  await expect.poll(() => page.evaluate(() => window.homeStageTest.centers)).toEqual([firstId]);
  await expect(page.locator('#stage')).toHaveAttribute('data-center-id', firstId);
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

  for (const width of [390, 1280]) {
    test(`stays below the layout-shift budget at ${width}px once images load and hydration settles`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
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
      const shifts = await page.evaluate(() => window.homeStageTest.layoutShifts);
      expect(
        shifts.reduce((total, value) => total + value, 0),
        JSON.stringify(shifts),
      ).toBeLessThan(0.05);
    });
  }

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
