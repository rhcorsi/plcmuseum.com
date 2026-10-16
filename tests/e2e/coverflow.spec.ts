import { expect, type Page, test } from '@playwright/test';
import { CENTER_CHANGE_EVENT, EXHIBIT_SELECT_EVENT, type CenterChangeDetail } from '../../src/islands/contracts';

declare global {
  interface Window {
    coverFlowTest: {
      items: Element[];
      changes: CenterChangeDetail[];
      emissions: { detail: CenterChangeDetail; at: number; centerId: string | undefined }[];
      keys: { key: string; at: number; motionMs: number }[];
      attachment?: { readyState: string; hasStage: boolean };
      layoutShifts: number[];
      layoutShiftSources?: {
        value: number;
        sources: { node?: string; stage: boolean; previous: unknown; current: unknown }[];
      }[];
      /** performance.now() when each observed item first carried is-parked. */
      parkedAt?: Record<string, number>;
    };
  }
}

const INITIAL_ID = 'fx-octal-rack-or5';
const FIRST_ID = 'fx-relay-replacer-r1';
const LAST_ID = 'fx-edge-pac-ep21';
const DISPUTED_ID = 'fx-phosphor-terminal-pt80';

test.use({ reducedMotion: 'no-preference' });

async function openStage(page: Page, { reduced = false, era = '1980s', theme = 'dark' } = {}) {
  await recordStage(page, reduced);
  await gotoFixture(page, era, theme);
  await expectAttached(page, reduced);
}

/** Emulates the motion preference and records events, layout shifts and stage keys from the first byte. */
async function recordStage(page: Page, reduced: boolean) {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.addInitScript((eventName) => {
    const observed = window;
    observed.coverFlowTest = { items: [], changes: [], emissions: [], keys: [], layoutShifts: [] };
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
          sources: { node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[];
        };
        if (!shift.hadRecentInput) {
          observed.coverFlowTest.layoutShifts.push(shift.value);
          (observed.coverFlowTest.layoutShiftSources ??= []).push({
            value: shift.value,
            sources: shift.sources.map(({ node, previousRect, currentRect }) => {
              const element = node instanceof Element ? node : node?.parentElement;
              return {
                node: node instanceof Element ? node.outerHTML.slice(0, 160) : node?.nodeName,
                stage: !!element?.closest('#stage, .stage-item, .coverflow-controls'),
                previous: previousRect.toJSON(),
                current: currentRect.toJSON(),
              };
            }),
          });
        }
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
      const detail = (event as CustomEvent<CenterChangeDetail>).detail;
      observed.coverFlowTest.changes.push(detail);
      observed.coverFlowTest.emissions.push({
        detail,
        at: performance.now(),
        centerId: document.getElementById('stage')?.dataset.centerId,
      });
    });
    document.addEventListener(
      'keydown',
      (event) => {
        if (
          event.target !== document.getElementById('stage') ||
          !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
        )
          return;
        const duration = getComputedStyle(event.target as HTMLElement)
          .getPropertyValue('--motion-stage')
          .trim();
        observed.coverFlowTest.keys.push({
          key: event.key,
          at: performance.now(),
          motionMs: parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000),
        });
      },
      true,
    );
  }, CENTER_CHANGE_EVENT);
}

async function gotoFixture(page: Page, era: string, theme: string) {
  const response = await page.goto(`/dev/coverflow?era=${era}&theme=${theme}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('data-era', era);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function expectAttached(page: Page, reduced: boolean) {
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
  const { changes, emissions } = await page.evaluate(() => window.coverFlowTest);
  for (const emission of emissions) expect(emission.centerId).toBe(emission.detail.id);
  return changes;
}

async function afterPaint(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

async function expectSilentSettle(page: Page, id: string) {
  await expect.poll(async () => (await centerChanges(page)).at(-1)?.id).toBe(id);
  await afterPaint(page);
  await expect(page.locator('[aria-live="polite"]')).toBeEmpty();
}

async function selectExhibit(page: Page, id: string) {
  await page.evaluate(
    ({ eventName, selectedId }) => document.dispatchEvent(new CustomEvent(eventName, { detail: { id: selectedId } })),
    { eventName: EXHIBIT_SELECT_EVENT, selectedId: id },
  );
}

/** One CENTER_CHANGE_EVENT after the initial one, at least the resolved --motion-stage plus 120 ms after the last key. */
async function expectOneSettledEmission(page: Page, keyCount: number) {
  const { emissions, keys } = await page.evaluate(() => window.coverFlowTest);
  expect(keys).toHaveLength(keyCount);
  expect(emissions).toHaveLength(2);
  const lastKey = keys.at(-1)!;
  expect(emissions[1]!.at - lastKey.at).toBeGreaterThanOrEqual(lastKey.motionMs + 120);
  await page.waitForTimeout(lastKey.motionMs + 120);
  expect(await centerChanges(page)).toHaveLength(2);
}

async function expectAnnouncement(page: Page, id: string) {
  const item = page.locator(`#stage-item-${id}`);
  const live = page.locator('[aria-live="polite"]');
  await expect(live).toContainText((await item.locator('.name').textContent())!.trim());
  await expect(live).toContainText((await item.locator('.year').textContent())!.trim());
  await expect(live).toBeVisible();
  await centerChanges(page);
}

test.describe('coverflow', () => {
  test('accepts an external selection dispatched synchronously by the initial center listener', async ({ page }) => {
    await page.addInitScript(
      ({ centerEvent, selectEvent, selectedId }) => {
        window.coverFlowTest = { items: [], changes: [], emissions: [], keys: [], layoutShifts: [] };
        document.addEventListener(centerEvent, (event) => {
          const detail = (event as CustomEvent<CenterChangeDetail>).detail;
          window.coverFlowTest.changes.push(detail);
          window.coverFlowTest.emissions.push({
            detail,
            at: performance.now(),
            centerId: document.getElementById('stage')?.dataset.centerId,
          });
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
    await expectSilentSettle(page, LAST_ID);
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
    await page.addInitScript(() => {
      const readyState = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState')!;
      Object.defineProperty(Document.prototype, 'readyState', {
        ...readyState,
        get() {
          const state = readyState.get!.call(this) as string;
          if (new Error().stack?.includes('/src/islands/CoverFlow.tsx')) {
            window.coverFlowTest.attachment = { readyState: state, hasStage: !!document.getElementById('stage') };
          }
          return state;
        },
      });
    });
    const barrierRequested = page.waitForRequest('**/__coverflow-parse-barrier.js');
    const opening = openStage(page);
    try {
      await barrierRequested;
      await expect(page.locator('#stage')).toHaveCount(0);
      await expect(page.locator('astro-island:not([ssr])')).toHaveCount(1);
      await expect
        .poll(() => page.evaluate(() => window.coverFlowTest.attachment))
        .toEqual({ readyState: 'loading', hasStage: false });
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
    await expect(page.getByRole('option')).toHaveCount(5);

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

  // End jumps the new center in from a parked slot, so its own transition-duration is 0s: the delay must come from
  // the resolved --motion-stage all the same.
  for (const [key, selectedId] of [
    ['ArrowRight', DISPUTED_ID],
    ['End', LAST_ID],
  ] as const) {
    test(`emits once after the complete motion delay for ${key}`, async ({ page }) => {
      await openStage(page);
      await afterPaint(page);
      await page.getByRole('listbox').focus();
      await page.keyboard.press(key);
      await expectSelected(page, selectedId);
      await expectSilentSettle(page, selectedId);
      await expectOneSettledEmission(page, 1);
    });
  }

  // Three keydowns in one task, so the steps always land within one frame (Playwright's key presses may not): the
  // card entering at plus 2 on the first step must lose is-jumping on the next ones and animate into the center.
  test('a burst of three steps animates the new center and emits once after the last step', async ({ page }) => {
    await openStage(page);
    await afterPaint(page);
    const selectedId = 'fx-bevel-station-bs95';
    const center = await page.evaluate(() => {
      const stage = document.getElementById('stage')!;
      for (let step = 0; step < 3; step += 1) {
        stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
      const item = stage.querySelector<HTMLElement>('.stage-item.is-center')!;
      const running = item
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition && animation.playState === 'running')
        .map((animation) => (animation as CSSTransition).transitionProperty);
      return { id: item.dataset.id, running };
    });
    expect(center).toEqual({ id: selectedId, running: expect.arrayContaining(['transform']) });
    await expectSelected(page, selectedId);
    await expectSilentSettle(page, selectedId);
    await expectOneSettledEmission(page, 3);
  });

  test('cards that leave the window during a burst fade out before they are parked', async ({ page }) => {
    await openStage(page);
    await afterPaint(page);
    // Opaque before the burst (the center and minus 1); three steps take both past minus 2.
    const leavingIds = [INITIAL_ID, 'fx-process-hiway-ph1'];
    const burst = await page.evaluate((ids) => {
      const stage = document.getElementById('stage')!;
      // When each leaving card is parked, not only whether: a parking due before its fade is over hides it mid-fade.
      const parkedAt: Record<string, number> = {};
      window.coverFlowTest.parkedAt = parkedAt;
      for (const id of ids) {
        const item = document.getElementById(`stage-item-${id}`)!;
        new MutationObserver(() => {
          if (item.classList.contains('is-parked')) parkedAt[id] ??= performance.now();
        }).observe(item, { attributes: true, attributeFilter: ['class'] });
      }
      const duration = getComputedStyle(stage).getPropertyValue('--motion-stage').trim();
      const at = performance.now();
      for (let step = 0; step < 3; step += 1) {
        stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
      const states = ids.map((id) => {
        const item = document.getElementById(`stage-item-${id}`)!;
        const fade = item
          .getAnimations()
          .find((animation) => animation instanceof CSSTransition && animation.transitionProperty === 'opacity');
        return {
          id,
          parked: item.classList.contains('is-parked'),
          visibility: getComputedStyle(item).visibility,
          fade: fade?.playState,
        };
      });
      return { at, motionMs: parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000), states };
    }, leavingIds);
    expect(burst.states).toEqual(
      leavingIds.map((id) => ({ id, parked: false, visibility: 'visible', fade: 'running' })),
    );
    for (const id of leavingIds) {
      const item = page.locator(`#stage-item-${id}`);
      await expect(item).toHaveClass(/\bis-parked\b/);
      await expect(item).toHaveCSS('visibility', 'hidden');
      await expect(item).toHaveCSS('opacity', '0');
    }
    const parkedAt = await page.evaluate(() => window.coverFlowTest.parkedAt!);
    for (const id of leavingIds) {
      // The whole fade, the resolved --motion-stage, less 1 ms for the coarsened clock of performance.now().
      expect(parkedAt[id]! - burst.at, `${id} parked before its fade was over`).toBeGreaterThanOrEqual(
        burst.motionMs - 1,
      );
    }
    await expect(page.getByRole('option')).toHaveCount(5);
  });

  test('a card that comes back before its fade time is over is never parked', async ({ page }) => {
    await openStage(page);
    await afterPaint(page);
    // At minus 2 before the steps: it leaves the window on the first and is back at minus 2 on the second.
    const returning = page.locator('#stage-item-fx-logic-cabinet-lc20');
    const motionMs = await page.evaluate(() => {
      const stage = document.getElementById('stage')!;
      for (const key of ['ArrowRight', 'ArrowLeft']) {
        stage.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      }
      const duration = getComputedStyle(stage).getPropertyValue('--motion-stage').trim();
      return parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
    });
    // Past the moment its parking was due.
    await page.waitForTimeout(motionMs + 250);
    await expect(returning).not.toHaveClass(/\bis-parked\b/);
    await expect(returning).toHaveCSS('visibility', 'visible');
    await expect(page.getByRole('option')).toHaveCount(5);
    await expectSelected(page, INITIAL_ID);
  });

  test('incoming neighbor runs a transition from the transparent outer slot', async ({ page }) => {
    await openStage(page);
    await afterPaint(page);
    const incoming = page.locator('#stage-item-fx-multiloop-ml8');
    expect(await incoming.evaluate((item) => getComputedStyle(item).opacity)).toBe('0');
    await incoming.evaluate((item) => {
      item.addEventListener('transitionrun', (event) => {
        if (event.target === item && ['transform', 'opacity'].includes((event as TransitionEvent).propertyName))
          item.setAttribute('data-test-transition', 'running');
      });
    });
    await page.getByRole('listbox').focus();
    await page.keyboard.press('ArrowRight');
    await expect(incoming).toHaveAttribute('data-test-transition', 'running');
    await expectSelected(page, DISPUTED_ID);
  });

  test('previous and next announce the supplied approximate and disputed year labels', async ({ page }) => {
    await openStage(page);
    const previous = page.getByRole('button', { name: 'Previous exhibit', exact: true });
    const next = page.getByRole('button', { name: 'Next exhibit', exact: true });
    await previous.click();
    await previous.click();
    const approximateId = 'fx-logic-cabinet-lc20';
    await expectSelected(page, approximateId);
    expect(await page.locator(`#stage-year-${approximateId}`).textContent()).toContain('approx.');
    await expectAnnouncement(page, approximateId);
    await next.click();
    await next.click();
    await next.click();
    await expectSelected(page, DISPUTED_ID);
    expect(await page.locator(`#stage-year-${DISPUTED_ID}`).textContent()).toContain('approx.');
    await expectAnnouncement(page, DISPUTED_ID);
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
    await expectSilentSettle(page, LAST_ID);
    await selectExhibit(page, 'fixture-does-not-exist');
    await expectSelected(page, LAST_ID);
    await expect(control).toBeFocused();
    await expectSilentSettle(page, LAST_ID);
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
    await expectAnnouncement(page, DISPUTED_ID);
    await expect(page.locator('#stage')).toHaveAttribute('data-center-id', DISPUTED_ID);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectStaticList(page);
    await expect(page.locator('#stage')).toHaveAttribute('data-center-id', DISPUTED_ID);
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
    await expectSilentSettle(page, LAST_ID);
    await expect(page.locator('#stage')).toHaveAttribute('data-center-id', LAST_ID);
  });

  for (const focusTarget of ['list', 'previous', 'open']) {
    test(`motion changes transfer ${focusTarget} focus to the current native link`, async ({ page }) => {
      await openStage(page);
      await page.getByRole('button', { name: 'Next exhibit', exact: true }).click();
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

  test('reduced-motion external selection preserves sender focus and stays silent after settling', async ({ page }) => {
    await openStage(page, { reduced: true });
    const sender = page.locator('#stage a.card').first();
    await sender.focus();
    await selectExhibit(page, LAST_ID);
    await expect(sender).toBeFocused();
    await expectSilentSettle(page, LAST_ID);
    await expect
      .poll(() => centerChanges(page))
      .toEqual([
        { id: INITIAL_ID, decade: '1980s', era: '1980s' },
        { id: LAST_ID, decade: '2020s', era: '2020s' },
      ]);
    await expect(page.locator(`#stage-item-${LAST_ID}`)).toBeInViewport();
    await selectExhibit(page, 'fixture-does-not-exist');
    await expect(sender).toBeFocused();
    await expectSilentSettle(page, LAST_ID);
    await selectExhibit(page, LAST_ID);
    // An unchanged pick emits no event to await; cover its reduced-motion debounce window explicitly.
    await page.waitForTimeout(120);
    await expectSilentSettle(page, LAST_ID);
    await expect(sender).toBeFocused();
    expect(await centerChanges(page)).toHaveLength(2);
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

  test('parked distant items receive no style or class writes including same-value calls', async ({ page }) => {
    await openStage(page);
    const mutations = await page.evaluate(async () => {
      const stage = document.getElementById('stage')!;
      const distant = stage.querySelector<HTMLElement>(`[data-id="fx-edge-pac-ep21"]`)!;
      // Leaves the window (from minus 2) on this step and is parked once its fade time is over; parking it must not
      // touch the cards that were parked already.
      const left = stage.querySelector<HTMLElement>(`[data-id="fx-logic-cabinet-lc20"]`)!;
      const targets = [distant, ...distant.querySelectorAll<HTMLElement>('*')];
      const styles = new Set(targets.map((element) => element.style));
      const classes = new Set(targets.map((element) => element.classList));
      const setProperty = CSSStyleDeclaration.prototype.setProperty;
      const toggle = DOMTokenList.prototype.toggle;
      let writes = 0;
      CSSStyleDeclaration.prototype.setProperty = function (
        this: CSSStyleDeclaration,
        ...args: Parameters<CSSStyleDeclaration['setProperty']>
      ) {
        if (styles.has(this)) writes += 1;
        return setProperty.apply(this, args);
      };
      DOMTokenList.prototype.toggle = function (this: DOMTokenList, ...args: Parameters<DOMTokenList['toggle']>) {
        if (classes.has(this)) writes += 1;
        return toggle.apply(this, args);
      };
      try {
        stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const step = {
          writes,
          visibility: getComputedStyle(distant).visibility,
          leftParked: left.matches('.is-parked'),
        };
        await new Promise<void>((resolve) => {
          const waitForPark = () => (left.matches('.is-parked') ? resolve() : setTimeout(waitForPark, 50));
          waitForPark();
        });
        return { step, parked: { writes, visibility: getComputedStyle(distant).visibility } };
      } finally {
        CSSStyleDeclaration.prototype.setProperty = setProperty;
        DOMTokenList.prototype.toggle = toggle;
      }
    });
    expect(mutations).toEqual({
      step: { writes: 0, visibility: 'hidden', leftParked: false },
      parked: { writes: 0, visibility: 'hidden' },
    });
    await expectSelected(page, DISPUTED_ID);
  });

  for (const count of [1, 2, 3, 4]) {
    test(`a stage of ${count}: wrap-around without transitions, one option per exhibit, clean teardown`, async ({
      page,
    }) => {
      await openStage(page);
      const listId = await cloneStage(page, count, `short-${count}-`);
      const result = await page.evaluate(
        async ({ size, cloneId }) => {
          const stageModule = '/src/islands/coverflow/stage.ts';
          const fixtureModule = '/src/fixtures/exhibits.ts';
          const { enhanceStage } = (await import(stageModule)) as typeof import('../../src/islands/coverflow/stage');
          const { fixtureExhibits } = (await import(fixtureModule)) as typeof import('../../src/fixtures/exhibits');
          const exhibits = fixtureExhibits.slice(0, size);
          const list = document.getElementById(cloneId)!;
          const items = [...list.querySelectorAll<HTMLElement>('.stage-item')];
          let selected = '';
          const emitted: { id: string; centerId: string | undefined }[] = [];
          const controller = enhanceStage({
            list,
            exhibits,
            initialId: exhibits[0]!.id,
            onActive: (card) => {
              selected = card.id;
            },
            onEnhanced: () => {},
            onSettled: (card) => {
              emitted.push({ id: card.id, centerId: list.dataset.centerId });
            },
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
          const options = [...list.querySelectorAll('[role="option"]')].map((option) => ({
            posinset: option.getAttribute('aria-posinset'),
            setsize: option.getAttribute('aria-setsize'),
          }));
          const active = list.getAttribute('aria-activedescendant');
          const beforeDestroy = list.dataset.centerId;
          controller.destroy();
          const restored = {
            center: list.hasAttribute('data-center-id'),
            styles: items.filter((item) => item.hasAttribute('style')).map((item) => item.getAttribute('style')),
          };
          const mismatched = enhanceStage({
            list,
            exhibits: exhibits.slice(1),
            initialId: exhibits[0]!.id,
            onActive: () => {},
            onEnhanced: () => {},
            onSettled: () => {},
          });
          const mismatchedCenter = list.hasAttribute('data-center-id');
          mismatched.destroy();
          list.remove();
          return {
            jumps,
            selections,
            expected: [exhibits[size - 1]!.id, exhibits[0]!.id],
            emitted,
            options,
            active,
            beforeDestroy,
            restored,
            mismatchedCenter,
          };
        },
        { size: count, cloneId: listId },
      );
      // A single exhibit is a listbox of one option that the keys leave selected.
      expect(result.selections).toEqual(result.expected);
      expect(result.options).toEqual(
        Array.from({ length: count }, (_, index) => ({ posinset: String(index + 1), setsize: String(count) })),
      );
      expect(result.active).toBe(`short-${count}-stage-link-${result.expected[1]}`);
      expect(result.emitted[0]).toEqual({ id: result.expected[1], centerId: result.expected[1] });
      for (const emission of result.emitted) expect(emission.centerId).toBe(emission.id);
      expect(result.beforeDestroy).toBe(result.emitted.at(-1)!.id);
      expect(result.restored).toEqual({ center: false, styles: [] });
      expect(result.mismatchedCenter).toBe(false);
      // Two cards exchange center and side by a single step; three and four have a side-to-side jump.
      if (count > 2) expect(result.jumps.length).toBeGreaterThan(0);
      for (const jump of result.jumps) expect(jump).toEqual({ duration: '0s', animations: 0 });
    });
  }

  // A card leaving the window is parked by a timer once its fade is over. Tearing the stage down during that fade must
  // cancel the timer, or it parks a card of the restored list, or of the stage a remount builds on the same list (its
  // new center included).
  for (const teardown of ['destroy', 'remount'] as const) {
    test(`${teardown} while cards are still fading out parks no card afterwards`, async ({ page }) => {
      await openStage(page);
      const listId = await cloneStage(page, 12, `${teardown}-`);
      const result = await page.evaluate(
        async ({ cloneId, remount, initialId }) => {
          const stageModule = '/src/islands/coverflow/stage.ts';
          const fixtureModule = '/src/fixtures/exhibits.ts';
          const { enhanceStage } = (await import(stageModule)) as typeof import('../../src/islands/coverflow/stage');
          const { fixtureExhibits } = (await import(fixtureModule)) as typeof import('../../src/fixtures/exhibits');
          const list = document.getElementById(cloneId)!;
          const items = [...list.querySelectorAll<HTMLElement>('.stage-item')];
          const unparked = () => items.filter((item) => !item.classList.contains('is-parked'));
          const options = {
            list,
            exhibits: fixtureExhibits,
            initialId,
            onActive: () => {},
            onEnhanced: () => {},
            onSettled: () => {},
          };
          const first = enhanceStage(options);
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const duration = getComputedStyle(list).getPropertyValue('--motion-stage').trim();
          const motionMs = parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
          for (let step = 0; step < 3; step += 1) {
            list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          }
          // The window of five plus the three cards that left it and are still fading out.
          const fading = unparked().length;
          first.destroy();
          const second = remount ? enhanceStage(options) : undefined;
          await new Promise((resolve) => setTimeout(resolve, motionMs + 300));
          const center = list.querySelector<HTMLElement>('.stage-item.is-center');
          const outcome = {
            fading,
            unparked: unparked().length,
            styled: items.filter((item) => item.hasAttribute('style')).length,
            center: center && { id: center.dataset.id, visibility: getComputedStyle(center).visibility },
          };
          second?.destroy();
          list.remove();
          return outcome;
        },
        { cloneId: listId, remount: teardown === 'remount', initialId: INITIAL_ID },
      );
      if (teardown === 'destroy') expect(result).toEqual({ fading: 8, unparked: 12, styled: 0, center: null });
      // The remount starts on the initial card again, whose window of five is exactly where the cards were fading out.
      else expect(result).toMatchObject({ fading: 8, unparked: 5, center: { id: INITIAL_ID, visibility: 'visible' } });
    });
  }

  test('a switch to reduced motion while cards are still fading out parks no card afterwards', async ({ page }) => {
    await openStage(page);
    await afterPaint(page);
    const burst = await page.evaluate(() => {
      const stage = document.getElementById('stage')!;
      const duration = getComputedStyle(stage).getPropertyValue('--motion-stage').trim();
      const at = performance.now();
      for (let step = 0; step < 3; step += 1) {
        stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }
      return { at, motionMs: parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000) };
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('#stage')).not.toHaveAttribute('role', 'listbox');
    // The list was restored while the leaving cards' parking was still due.
    expect((await page.evaluate(() => performance.now())) - burst.at).toBeLessThan(burst.motionMs);
    await page.waitForTimeout(burst.motionMs + 300);
    await expect(page.locator('#stage .stage-item.is-parked')).toHaveCount(0);
    await expectStaticList(page);
  });

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
        JSON.stringify(await page.evaluate(() => window.coverFlowTest.layoutShiftSources)),
      ).toBeLessThan(0.05);
      expect(
        await page.evaluate(() =>
          (window.coverFlowTest.layoutShiftSources ?? [])
            .flatMap((entry) => entry.sources)
            .filter((source) => source.stage),
        ),
      ).toEqual([]);
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

/**
 * Puts a copy of the first `size` items of #stage after it, unenhanced and with every id and id reference prefixed,
 * for a controller the test enhances and tears down itself. Returns the copy's id.
 */
async function cloneStage(page: Page, size: number, prefix: string) {
  return page.evaluate(
    ({ count, idPrefix }) => {
      const source = document.getElementById('stage')!;
      const list = source.cloneNode(false) as HTMLElement;
      list.id = `${idPrefix}stage`;
      list.classList.remove('is-coverflow', 'is-initializing');
      for (const sourceItem of [...source.querySelectorAll<HTMLElement>('.stage-item')].slice(0, count)) {
        const item = sourceItem.cloneNode(true) as HTMLElement;
        item.classList.remove('is-center', 'is-near', 'is-parked', 'is-jumping');
        item.removeAttribute('style');
        for (const element of [item, ...item.querySelectorAll<HTMLElement>('*')]) {
          if (element.id) element.id = `${idPrefix}${element.id}`;
          for (const attribute of ['aria-labelledby', 'aria-describedby']) {
            const value = element.getAttribute(attribute);
            if (value)
              element.setAttribute(
                attribute,
                value
                  .split(' ')
                  .map((id) => `${idPrefix}${id}`)
                  .join(' '),
              );
          }
        }
        list.append(item);
      }
      source.after(list);
      return list.id;
    },
    { count: size, idPrefix: prefix },
  );
}

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
          !item.hasAttribute('style') &&
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
