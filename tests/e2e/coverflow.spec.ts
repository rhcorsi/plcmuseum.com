import { expect, type Page, test } from '@playwright/test';
import { CENTER_CHANGE_EVENT, EXHIBIT_SELECT_EVENT, type CenterChangeDetail } from '../../src/islands/contracts';

declare global {
  interface Window {
    coverFlowTest: { items: Element[]; changes: CenterChangeDetail[]; layoutShifts: number[] };
  }
}

const INITIAL_ID = 'fx-octal-rack-or5';
const FIRST_ID = 'fx-relay-replacer-r1';
const LAST_ID = 'fx-edge-pac-ep21';
const DISPUTED_ID = 'fx-phosphor-terminal-pt80';

test.use({ reducedMotion: 'no-preference' });

async function openStage(page: Page, { reduced = false, era = '1980s', theme = 'dark' } = {}) {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.addInitScript((eventName) => {
    const observed = window;
    observed.coverFlowTest = { items: [], changes: [], layoutShifts: [] };
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
        if (!shift.hadRecentInput) observed.coverFlowTest.layoutShifts.push(shift.value);
      }
    }).observe({ type: 'layout-shift', buffered: true });
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
  const response = await page.goto(`/dev/coverflow?era=${era}&theme=${theme}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('data-era', era);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // The initial event proves the controller attached, including when its static fallback has no role.
  await expect.poll(() => centerChanges(page)).toEqual([{ id: INITIAL_ID, decade: '1980s', era: '1980s' }]);
  await expect(page.locator('[aria-live="polite"]')).toBeEmpty();
  if (!reduced) {
    await expect(page.locator('#stage')).toHaveAttribute('role', 'listbox');
    await expectSelected(page, INITIAL_ID);
  }
}

async function expectSelected(page: Page, id: string) {
  await expect(page.locator('#stage')).toHaveAttribute('aria-activedescendant', `stage-link-${id}`);
  await expect(page.locator('#stage [aria-selected="true"]')).toHaveCount(1);
  await expect(page.locator(`#stage-link-${id}`)).toHaveAttribute('aria-selected', 'true');
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

async function expectAnnouncement(page: Page, id: string) {
  const item = page.locator(`#stage-item-${id}`);
  const live = page.locator('[aria-live="polite"]');
  await expect(live).toContainText((await item.locator('.name').textContent())!.trim());
  await expect(live).toContainText((await item.locator('.year').textContent())!.trim());
  await expect(live).toBeVisible();
}

test.describe('coverflow', () => {
  test('accepts an external selection dispatched synchronously by the initial center listener', async ({ page }) => {
    await page.addInitScript(
      ({ centerEvent, selectEvent, selectedId }) => {
        window.coverFlowTest = { items: [], changes: [], layoutShifts: [] };
        document.addEventListener(centerEvent, (event) => {
          window.coverFlowTest.changes.push((event as CustomEvent<CenterChangeDetail>).detail);
          if (window.coverFlowTest.changes.length === 1) {
            document.dispatchEvent(new CustomEvent(selectEvent, { detail: { id: selectedId } }));
          }
        });
      },
      { centerEvent: CENTER_CHANGE_EVENT, selectEvent: EXHIBIT_SELECT_EVENT, selectedId: LAST_ID },
    );
    await page.goto('/dev/coverflow');
    await expectSelected(page, LAST_ID);
    await expect
      .poll(() => centerChanges(page))
      .toEqual([
        { id: INITIAL_ID, decade: '1980s', era: '1980s' },
        { id: LAST_ID, decade: '2020s', era: '2020s' },
      ]);
    await expectAnnouncement(page, LAST_ID);
  });

  test('defers enhancement until the server-rendered list finishes parsing', async ({ page }) => {
    // Cache the island module so hydration can race the blocked HTML parser, even on a cold dev server.
    await page.goto('/dev/coverflow');
    await expect(page.locator('#stage')).toHaveAttribute('role', 'listbox');
    let releaseList: () => void = () => {};
    const parserBarrier = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    await page.route('**/__coverflow-parse-barrier.js', async (route) => {
      await parserBarrier;
      await route.fulfill({ contentType: 'text/javascript', body: '' });
    });
    await page.route('**/dev/coverflow?*', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      expect(body).toMatch(/<ol\b[^>]*id="stage"/);
      await route.fulfill({
        response,
        body: body.replace(/<ol\b(?=[^>]*id="stage")/, '<script src="/__coverflow-parse-barrier.js"></script><ol'),
      });
    });
    const opening = openStage(page);
    try {
      await expect(page.locator('astro-island:not([ssr])')).toHaveCount(1);
      await expect(page.locator('#stage')).toHaveCount(0);
      expect(await centerChanges(page)).toEqual([]);
    } finally {
      releaseList();
      await opening;
    }
  });

  test('enhances the original 12 nodes with names, image dimensions and adjacent credits', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openStage(page);

    const items = page.locator('#stage .stage-item');
    await expect(items).toHaveCount(12);
    expect(await items.evaluateAll((nodes) => nodes.flatMap((item) => item.getAnimations()).length)).toBe(0);
    await expect(page.getByRole('option', { includeHidden: true })).toHaveCount(12);
    await expect(
      page.locator('[role=option] :is(a[href], button, input, select, textarea, summary, [tabindex])'),
    ).toHaveCount(0);
    expect(
      await items.evaluateAll((current) => {
        const original = window.coverFlowTest.items;
        return current.every((item, index) => item === original[index]);
      }),
    ).toBe(true);
    for (const [index, item] of (await items.all()).entries()) {
      await expect(item).toHaveAttribute('role', 'none');
      expect(
        await item.evaluate((element) => element.getAttributeNames().filter((name) => name.startsWith('aria-'))),
      ).toEqual([]);
      const option = item.locator('a.card');
      await expect(option).toHaveAttribute('role', 'option');
      await expect(option).toHaveAttribute('tabindex', '-1');
      await expect(option).toHaveAttribute('aria-posinset', String(index + 1));
      await expect(option).toHaveAttribute('aria-setsize', '12');
      await expect(option).not.toHaveAttribute('aria-label');
      const id = await item.getAttribute('data-id');
      await expect(option).toHaveAttribute('aria-labelledby', `stage-name-${id} stage-maker-${id} stage-year-${id}`);
      await expect(option).toHaveAttribute('aria-describedby', `stage-tagline-${id}`);
      for (const suffix of ['name', 'maker', 'year', 'tagline']) {
        await expect(item.locator(`#stage-${suffix}-${id}`)).toHaveCount(1);
        expect((await item.locator(`#stage-${suffix}-${id}`).textContent())!.trim()).not.toBe('');
      }
      const name = await option.evaluate((element) =>
        (element.getAttribute('aria-labelledby') ?? '')
          .split(' ')
          .map((id) => document.getElementById(id)?.textContent?.trim())
          .join(' '),
      );
      if (await option.isVisible()) {
        await expect(option).toHaveAccessibleName(name);
        await expect(option).toHaveAccessibleDescription((await item.locator('.tagline').textContent())!.trim());
      }
    }
    await expect(page.getByRole('option')).toHaveCount(3);

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
    for (const element of [stage, page.locator('#stage .is-center .card')]) {
      const outline = await element.evaluate((node) => {
        const style = getComputedStyle(node);
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-focus)';
        node.append(probe);
        const focusColor = getComputedStyle(probe).color;
        probe.remove();
        return { style: style.outlineStyle, color: style.outlineColor, focusColor };
      });
      expect(outline.style).toBe('solid');
      expect(outline.color).toBe(outline.focusColor);
    }
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
    const open = page.getByRole('link', { name: 'Open exhibit', exact: true });
    await expect(open).toHaveAttribute('aria-describedby', `stage-name-${DISPUTED_ID}`);
    await expect(open).toHaveAccessibleDescription(
      (await page.locator(`#stage-name-${DISPUTED_ID}`).textContent())!.trim(),
    );
    await expect(open).toHaveAttribute('href', `/en/exhibits/${DISPUTED_ID}`);
    await expectAnnouncement(page, DISPUTED_ID);
    await page.getByRole('button', { name: 'Previous exhibit', exact: true }).click();
    await expectSelected(page, INITIAL_ID);
    await expectAnnouncement(page, INITIAL_ID);
    await page.locator(`#stage-item-${DISPUTED_ID} .card`).click();
    await expectSelected(page, DISPUTED_ID);
    await expect(page.getByRole('listbox')).toBeFocused();
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
    await expect(page.locator('[aria-live="polite"]')).toBeEmpty();
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
    await expectAnnouncement(page, LAST_ID);
    await selectExhibit(page, 'fixture-does-not-exist');
    await expectSelected(page, LAST_ID);
    await expect(control).toBeFocused();
  });

  test('keyboard clears the prior announcement so controls can announce the same exhibit again', async ({ page }) => {
    await openStage(page);
    await page.getByRole('button', { name: 'Next exhibit', exact: true }).click();
    await expectAnnouncement(page, DISPUTED_ID);
    const live = page.locator('[aria-live="polite"]');
    const announcement = await live.textContent();

    await page.getByRole('listbox').focus();
    await page.keyboard.press('ArrowRight');
    await expectSelected(page, 'fx-multiloop-ml8');
    await expect(live).toBeEmpty();

    await page.getByRole('button', { name: 'Previous exhibit', exact: true }).click();
    await expectSelected(page, DISPUTED_ID);
    await expect(live).toHaveText(announcement!);
  });

  test('horizontal wheel moves the stage and vertical wheel remains available for page scrolling', async ({ page }) => {
    await openStage(page);
    const stage = page.getByRole('listbox');
    await stage.hover();
    await page.mouse.wheel(160, 0);
    await expectSelected(page, DISPUTED_ID);
    await expectAnnouncement(page, DISPUTED_ID);
    const initialScroll = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, -250);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(initialScroll);
    await expectSelected(page, DISPUTED_ID);
    await stage.hover();
    await page.mouse.wheel(-160, 0);
    await expectSelected(page, INITIAL_ID);
    await expectAnnouncement(page, INITIAL_ID);
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
    await expectAnnouncement(page, DISPUTED_ID);
    await expect(page).toHaveURL(/\/dev\/coverflow\?/);
    await session.detach();
  });

  test('changing the OS motion preference restores the original list and can enhance it again', async ({ page }) => {
    await openStage(page);
    await page.getByRole('button', { name: 'Next exhibit', exact: true }).click();
    await expectSelected(page, DISPUTED_ID);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectStaticList(page);
    await expect(page.locator(`#stage-link-${DISPUTED_ID}`)).toBeFocused();
    await expect(page.getByRole('button', { name: 'Next exhibit', exact: true })).toBeHidden();
    expect(
      await page
        .locator('#stage .stage-item')
        .evaluateAll((current) => current.every((item, index) => item === window.coverFlowTest.items[index])),
    ).toBe(true);
    await page.locator(`#stage-link-${LAST_ID}`).focus();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('#stage')).toHaveAttribute('role', 'listbox');
    await expectSelected(page, LAST_ID);
    await expect(page.getByRole('listbox')).toBeFocused();
  });

  for (const focusTarget of ['list', 'previous', 'open']) {
    test(`motion changes transfer ${focusTarget} focus to the current native link`, async ({ page }) => {
      await openStage(page);
      await selectExhibit(page, DISPUTED_ID);
      await expectAnnouncement(page, DISPUTED_ID);
      const target =
        focusTarget === 'list'
          ? page.getByRole('listbox')
          : focusTarget === 'open'
            ? page.getByRole('link', { name: 'Open exhibit', exact: true })
            : page.getByRole('button', { name: 'Previous exhibit', exact: true });
      await target.focus();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expectStaticList(page);
      await expect(page.locator(`#stage-link-${DISPUTED_ID}`)).toBeFocused();
      await expect(page.locator(`#stage-link-${DISPUTED_ID}`)).toBeInViewport();
    });
  }

  test('an initial reduced-motion preference keeps the vertical list, links and untransformed items', async ({
    page,
  }) => {
    await openStage(page, { reduced: true });
    await expectStaticList(page);
    await expect(page.getByRole('button', { name: 'Next exhibit', exact: true })).toBeHidden();
  });

  test('reduced-motion external selection preserves sender focus and announces the selected exhibit', async ({
    page,
  }) => {
    await openStage(page, { reduced: true });
    const sender = page.locator('#stage a.card').first();
    await sender.focus();
    await selectExhibit(page, LAST_ID);
    await expect(sender).toBeFocused();
    await expectAnnouncement(page, LAST_ID);
    await expect
      .poll(() => centerChanges(page))
      .toEqual([
        { id: INITIAL_ID, decade: '1980s', era: '1980s' },
        { id: LAST_ID, decade: '2020s', era: '2020s' },
      ]);
    await expect(page.locator(`#stage-item-${LAST_ID}`)).toBeInViewport();
    await selectExhibit(page, 'fixture-does-not-exist');
    await expect(sender).toBeFocused();
    await expectAnnouncement(page, LAST_ID);
  });

  test('an option receiving pointer focus returns ownership to the listbox', async ({ page }) => {
    await openStage(page);
    const option = page.locator(`#stage-link-${INITIAL_ID}`);
    await option.scrollIntoViewIfNeeded();
    const bounds = await option.boundingBox();
    expect(bounds).not.toBeNull();
    if (!bounds) throw new Error('The centered option has no bounds');
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await expect(page.getByRole('listbox')).toBeFocused();
    // Releasing outside the option avoids following the centered exhibit.
    await page.mouse.move(0, 0);
    await page.mouse.up();
  });

  test('parked distant items receive no attribute writes during nearby navigation', async ({ page }) => {
    await openStage(page);
    const mutations = await page.evaluate(async () => {
      const stage = document.getElementById('stage')!;
      const distant = stage.querySelector<HTMLElement>(`[data-id="fx-edge-pac-ep21"]`)!;
      const records: MutationRecord[] = [];
      const observer = new MutationObserver((changes) => records.push(...changes));
      observer.observe(distant, { attributes: true, subtree: true });
      stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      records.push(...observer.takeRecords());
      observer.disconnect();
      return { writes: records.length, visibility: getComputedStyle(distant).visibility };
    });
    expect(mutations).toEqual({ writes: 0, visibility: 'hidden' });
    await expectSelected(page, DISPUTED_ID);
  });

  for (const count of [2, 3, 4]) {
    test(`wrap-around parks jumps without transitions with ${count} exhibits`, async ({ page }) => {
      await openStage(page);
      const result = await page.evaluate(async (size) => {
        const stageModule = '/src/islands/coverflow/stage.ts';
        const fixtureModule = '/src/fixtures/exhibits.ts';
        const { enhanceStage } = (await import(stageModule)) as typeof import('../../src/islands/coverflow/stage');
        const { fixtureExhibits } = (await import(fixtureModule)) as typeof import('../../src/fixtures/exhibits');
        const exhibits = fixtureExhibits.slice(0, size);
        const source = document.getElementById('stage')!;
        const list = source.cloneNode(false) as HTMLElement;
        list.id = `short-stage-${size}`;
        list.classList.remove('is-coverflow', 'is-initializing');
        const items = [...source.querySelectorAll<HTMLElement>('.stage-item')].slice(0, size).map((sourceItem) => {
          const item = sourceItem.cloneNode(true) as HTMLElement;
          item.classList.remove('is-center', 'is-near', 'is-parked', 'is-jumping');
          item.removeAttribute('style');
          for (const element of [item, ...item.querySelectorAll<HTMLElement>('*')]) {
            if (element.id) element.id = `short-${size}-${element.id}`;
            for (const attribute of ['aria-labelledby', 'aria-describedby']) {
              const value = element.getAttribute(attribute);
              if (value)
                element.setAttribute(
                  attribute,
                  value
                    .split(' ')
                    .map((id) => `short-${size}-${id}`)
                    .join(' '),
                );
            }
          }
          list.append(item);
          return item;
        });
        source.after(list);
        let selected = '';
        const controller = enhanceStage({
          list,
          exhibits,
          initialId: exhibits[0]!.id,
          onActive: (card) => {
            selected = card.id;
          },
          onEnhanced: () => {},
          onSettled: () => {},
        });
        const afterPaint = () =>
          new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        await afterPaint();
        const jumps: { duration: string; animations: number }[] = [];
        const selections: string[] = [];
        for (const key of ['ArrowLeft', 'ArrowRight']) {
          const previous = items.map((item) => Number(item.style.getPropertyValue('--coverflow-offset')));
          list.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
          selections.push(selected);
          items.forEach((item, index) => {
            const offset = Number(item.style.getPropertyValue('--coverflow-offset'));
            if (Math.abs(offset - previous[index]!) > 1) {
              jumps.push({
                duration: getComputedStyle(item).transitionDuration,
                animations: item.getAnimations().length,
              });
            }
          });
          await afterPaint();
        }
        controller.destroy();
        list.remove();
        return { jumps, selections, expected: [exhibits[size - 1]!.id, exhibits[0]!.id] };
      }, count);
      expect(result.selections).toEqual(result.expected);
      // Two cards exchange center and side by a single step; three and four have a side-to-side jump.
      if (count > 2) expect(result.jumps.length).toBeGreaterThan(0);
      for (const jump of result.jumps) expect(jump).toEqual({ duration: '0s', animations: 0 });
    });
  }

  for (const width of [390, 1280]) {
    test(`hydration and image loading stay below the layout-shift budget at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openStage(page, { era: 'museum' });
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
      expect(
        await page.evaluate(() => window.coverFlowTest.layoutShifts.reduce((total, value) => total + value, 0)),
      ).toBeLessThan(0.05);
      expect(
        await page
          .locator('#stage .stage-item')
          .evaluateAll((items) => items.flatMap((item) => item.getAnimations()).length),
      ).toBe(0);
    });
  }

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
    for (const reduced of [false, true]) {
      test(`${width}px museum ${reduced ? 'reduced motion' : 'stage'}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await openStage(page, { reduced, era: 'museum', theme: 'light' });
        const stage = page.locator('#stage');
        if (reduced) {
          await expectStaticList(page);
          await stage.locator('.stage-item').first().scrollIntoViewIfNeeded();
        } else {
          await stage.scrollIntoViewIfNeeded();
          await expect(stage.locator('.stage-item')).toHaveCount(12);
          const watermark = stage.locator('.is-center .stage-watermark');
          await expect(watermark).toHaveAttribute('aria-hidden', 'true');
          await expect(watermark).toHaveText('1984');
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        const path = testInfo.outputPath(`coverflow-${width}-museum-${reduced ? 'reduced' : 'stage'}.png`);
        await page.screenshot({ path, fullPage: false, animations: 'disabled' });
        await testInfo.attach('CoverFlow viewport', { path, contentType: 'image/png' });
      });
    }
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
        const restored = ['role', 'tabindex', 'aria-selected', 'aria-posinset', 'aria-setsize', 'aria-label'];
        return (
          getComputedStyle(item).transform === 'none' &&
          restored.every((attribute) => !item.hasAttribute(attribute) && !link?.hasAttribute(attribute)) &&
          link?.tabIndex === 0
        );
      }),
    ),
  ).toBe(true);
  const first = await stage.locator('.stage-item').nth(0).boundingBox();
  const second = await stage.locator('.stage-item').nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
}
