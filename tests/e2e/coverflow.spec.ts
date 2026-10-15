import { expect, type Page, test } from '@playwright/test';
import { CENTER_CHANGE_EVENT, EXHIBIT_SELECT_EVENT, type CenterChangeDetail } from '../../src/islands/contracts';

declare global {
  interface Window {
    coverFlowTest: { items: Element[]; changes: CenterChangeDetail[] };
  }
}

const INITIAL_ID = 'fx-octal-rack-or5';
const FIRST_ID = 'fx-relay-replacer-r1';
const LAST_ID = 'fx-edge-pac-ep21';
const DISPUTED_ID = 'fx-phosphor-terminal-pt80';

test.use({ reducedMotion: 'no-preference' });

async function openStage(page: Page) {
  await page.addInitScript((eventName) => {
    const observed = window;
    observed.coverFlowTest = { items: [], changes: [] };
    const observer = new MutationObserver(() => {
      const items = [...document.querySelectorAll('.stage-list .stage-item')];
      if (items.length === 12) {
        observed.coverFlowTest.items = items;
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
    document.addEventListener(eventName, (event) => {
      observed.coverFlowTest.changes.push((event as CustomEvent<CenterChangeDetail>).detail);
    });
  }, CENTER_CHANGE_EVENT);
  const response = await page.goto('/dev/coverflow?era=1980s&theme=dark');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('data-era', '1980s');
  await page.locator('#stage').scrollIntoViewIfNeeded();
  await expect(page.locator('#stage')).toHaveAttribute('role', 'listbox');
  await expectSelected(page, INITIAL_ID);
  await expect.poll(() => centerChanges(page)).toEqual([{ id: INITIAL_ID, decade: '1980s', era: '1980s' }]);
}

async function expectSelected(page: Page, id: string) {
  await expect(page.locator('#stage')).toHaveAttribute('aria-activedescendant', `stage-item-${id}`);
  await expect(page.locator('#stage [aria-selected="true"]')).toHaveCount(1);
  await expect(page.locator(`#stage-item-${id}`)).toHaveAttribute('aria-selected', 'true');
}

async function centerChanges(page: Page) {
  return page.evaluate(() => window.coverFlowTest.changes);
}

async function selectExhibit(page: Page, id: string) {
  await page.evaluate(
    ({ eventName, selectedId }) => document.dispatchEvent(new CustomEvent(eventName, { detail: { id: selectedId } })),
    { eventName: EXHIBIT_SELECT_EVENT, selectedId: id },
  );
}

test.describe('coverflow', () => {
  test('enhances the original 12 nodes with names, image dimensions and adjacent credits', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openStage(page);

    const items = page.locator('#stage .stage-item');
    await expect(items).toHaveCount(12);
    await expect(page.getByRole('option')).toHaveCount(12);
    expect(
      await items.evaluateAll((current) => {
        const original = window.coverFlowTest.items;
        return current.every((item, index) => item === original[index]);
      }),
    ).toBe(true);
    for (const item of await items.all()) {
      await expect(item).toHaveAccessibleName((await item.locator('.name').innerText()).trim());
    }

    await expect(page.locator('#stage .photo')).toHaveCount(10);
    await expect(page.locator('#stage svg use')).toHaveCount(2);
    for (const visual of await page.locator('#stage .visual:has(img)').all()) {
      const photo = visual.locator('img');
      expect(Number(await photo.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(await photo.getAttribute('height'))).toBeGreaterThan(0);
      await expect(visual.locator('.credit')).toHaveText('Fixture placeholder, not a real photograph');
    }
    const promoted = await items.evaluateAll(
      (nodes) => nodes.filter((node) => getComputedStyle(node).willChange.includes('transform')).length,
    );
    expect(promoted).toBeLessThanOrEqual(3);
    expect(errors).toEqual([]);
  });

  test('keyboard wraps, supports Home and End, retains focus and follows the selected href on Enter', async ({
    page,
  }) => {
    await openStage(page);
    const stage = page.getByRole('listbox');
    await stage.focus();
    await page.keyboard.press('Home');
    await expectSelected(page, FIRST_ID);
    await page.keyboard.press('ArrowLeft');
    await expectSelected(page, LAST_ID);
    await page.keyboard.press('ArrowRight');
    await expectSelected(page, FIRST_ID);
    await page.keyboard.press('End');
    await expectSelected(page, LAST_ID);
    await expect(stage).toBeFocused();
    expect(await stage.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    const href = await page.locator(`#stage-item-${LAST_ID} a`).getAttribute('href');
    expect(href).toBeTruthy();
    await page.route(`**${href}`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Exhibit</p>' }),
    );
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test('previous and next controls update the open link and a side click selects before opening', async ({ page }) => {
    await openStage(page);
    await page.getByRole('button', { name: 'Next exhibit', exact: true }).click();
    await expectSelected(page, DISPUTED_ID);
    await expect(page.getByRole('link', { name: 'Open exhibit', exact: true })).toHaveAttribute(
      'href',
      `/en/exhibits/${DISPUTED_ID}`,
    );
    await page.getByRole('button', { name: 'Previous exhibit', exact: true }).click();
    await expectSelected(page, INITIAL_ID);
    await page.locator(`#stage-item-${DISPUTED_ID} .card`).click();
    await expectSelected(page, DISPUTED_ID);
    await expect(page).toHaveURL(/\/dev\/coverflow\?/);
  });

  test('announces the supplied approximate years and emits one event for a settled navigation burst', async ({
    page,
  }) => {
    await openStage(page);
    await page.evaluate(() => {
      window.coverFlowTest.changes = [];
    });
    const stage = page.getByRole('listbox');
    await stage.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const selectedId = 'fx-bevel-station-bs95';
    await expectSelected(page, selectedId);
    expect(await centerChanges(page)).toEqual([]);
    const expected = [{ id: selectedId, decade: '1990s', era: '1990s' }];
    await expect.poll(() => centerChanges(page)).toEqual(expected);
    // A second full transition window would expose stale timers from earlier keys.
    await page.waitForTimeout(1000);
    expect(await centerChanges(page)).toEqual(expected);

    const live = page.locator('[aria-live="polite"]');
    for (const id of ['fx-logic-cabinet-lc20', DISPUTED_ID]) {
      await selectExhibit(page, id);
      await expectSelected(page, id);
      const item = page.locator(`#stage-item-${id}`);
      const name = (await item.locator('.name').innerText()).trim();
      const yearLabel = (await item.locator('.year').innerText()).trim();
      expect(yearLabel).toContain('approx.');
      await expect(live).toContainText(name);
      await expect(live).toContainText(yearLabel);
    }
  });

  test('external selection accepts a known exhibit and ignores invalid ids without disturbing focus', async ({
    page,
  }) => {
    await openStage(page);
    const control = page.getByRole('button', { name: 'Next exhibit', exact: true });
    await control.focus();
    await selectExhibit(page, LAST_ID);
    await expectSelected(page, LAST_ID);
    await expect(control).toBeFocused();
    await selectExhibit(page, 'fixture-does-not-exist');
    await expectSelected(page, LAST_ID);
    await expect(control).toBeFocused();
  });

  test('horizontal wheel moves the stage and vertical wheel remains available for page scrolling', async ({ page }) => {
    await openStage(page);
    const stage = page.getByRole('listbox');
    await stage.hover();
    await page.mouse.wheel(160, 0);
    await expectSelected(page, DISPUTED_ID);
    const initialScroll = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, -250);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(initialScroll);
    await expectSelected(page, DISPUTED_ID);
    await stage.hover();
    await page.mouse.wheel(-160, 0);
    await expectSelected(page, INITIAL_ID);
  });

  test('touch swipe changes the centered exhibit without following its link', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openStage(page);
    const stage = page.getByRole('listbox');
    await stage.scrollIntoViewIfNeeded();
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error('CoverFlow stage has no visible bounds');
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const x = box.x + box.width * 0.75;
    const y = Math.min(box.y + box.height / 2, 700);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const distance of [30, 70, 110, 160]) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - distance, y }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expectSelected(page, DISPUTED_ID);
    await expect(page).toHaveURL(/\/dev\/coverflow\?/);
    await session.detach();
  });

  test('changing the OS motion preference restores the original list and can enhance it again', async ({ page }) => {
    await openStage(page);
    await page.getByRole('button', { name: 'Next exhibit', exact: true }).click();
    await expectSelected(page, DISPUTED_ID);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectStaticList(page);
    await expect(page.getByRole('button', { name: 'Next exhibit', exact: true })).toBeHidden();
    expect(
      await page
        .locator('#stage .stage-item')
        .evaluateAll((current) => current.every((item, index) => item === window.coverFlowTest.items[index])),
    ).toBe(true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('#stage')).toHaveAttribute('role', 'listbox');
    await expectSelected(page, DISPUTED_ID);
  });

  test('an initial reduced-motion preference keeps the vertical list, links and untransformed items', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/dev/coverflow');
    await expect(page.locator('astro-island:not([ssr])')).toHaveCount(1);
    await expectStaticList(page);
    await expect(page.getByRole('button', { name: 'Next exhibit', exact: true })).toBeHidden();
  });

  test('without JavaScript the same 12 exhibits remain readable and linked', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto('/dev/coverflow');
    await expectStaticList(page);
    await expect(page.locator(`#stage-item-${INITIAL_ID} a`)).toHaveAttribute('href', `/en/exhibits/${INITIAL_ID}`);
    await context.close();
  });
});

test.describe('coverflow visual captures', () => {
  for (const width of [390, 1280]) {
    for (const era of ['museum', '1970s', '1980s', '1990s', '2000s', '2020s']) {
      for (const theme of ['light', 'dark']) {
        test(`${width}px ${era} ${theme}`, async ({ page }, testInfo) => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`/dev/coverflow?era=${era}&theme=${theme}`);
          await expect(page.locator('html')).toHaveAttribute('data-era', era);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          const stage = page.locator('#stage');
          await expect(stage).toHaveAttribute('role', 'listbox');
          await stage.scrollIntoViewIfNeeded();
          await expect(stage.locator('.stage-item')).toHaveCount(12);
          const watermark = stage.locator('[aria-selected="true"] .stage-watermark');
          await expect(watermark).toHaveAttribute('aria-hidden', 'true');
          await expect(watermark).toHaveText('1984');
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          const path = testInfo.outputPath(`coverflow-${width}-${era}-${theme}.png`);
          await page.screenshot({ path, fullPage: false, animations: 'disabled' });
          await testInfo.attach('CoverFlow viewport', { path, contentType: 'image/png' });
        });
      }
    }

    test(`${width}px reduced motion`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/dev/coverflow?era=1980s&theme=dark');
      await expect(page.locator('html')).toHaveAttribute('data-era', '1980s');
      await expect(page.locator('astro-island:not([ssr])')).toHaveCount(1);
      await expectStaticList(page);
      await page.locator('#stage .stage-item').first().scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const path = testInfo.outputPath(`coverflow-${width}-reduced.png`);
      await page.screenshot({ path, fullPage: false, animations: 'disabled' });
      await testInfo.attach('CoverFlow reduced-motion viewport', { path, contentType: 'image/png' });
    });
  }
});

async function expectStaticList(page: Page) {
  const stage = page.locator('#stage');
  await expect(stage).not.toHaveAttribute('role', 'listbox');
  await expect(stage).not.toHaveAttribute('aria-activedescendant');
  await expect(stage.locator('.stage-item')).toHaveCount(12);
  await expect(stage.locator('.stage-item a')).toHaveCount(12);
  expect(
    await stage.locator('.stage-item').evaluateAll((items) =>
      items.every((item) => {
        const link = item.querySelector('a');
        return getComputedStyle(item).transform === 'none' && !item.hasAttribute('role') && link?.tabIndex === 0;
      }),
    ),
  ).toBe(true);
  const first = await stage.locator('.stage-item').nth(0).boundingBox();
  const second = await stage.locator('.stage-item').nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
}
