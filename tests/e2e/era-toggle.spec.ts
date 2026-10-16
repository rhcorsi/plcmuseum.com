import { expect, test, type Page } from '@playwright/test';
import { CENTER_CHANGE_EVENT, ERA_TOGGLE_HOOKS, STORAGE_KEYS } from '../../src/islands/contracts';
import { ERA_THEMES, type EraTheme } from '../../src/lib/era';
import { LANGS } from '../../src/i18n/langs';
import en from '../../src/i18n/en.json' with { type: 'json' };
import pt from '../../src/i18n/pt.json' with { type: 'json' };
import es from '../../src/i18n/es.json' with { type: 'json' };
import de from '../../src/i18n/de.json' with { type: 'json' };
import it from '../../src/i18n/it.json' with { type: 'json' };
import {
  failStorage,
  installRecorder,
  prefsStubRan,
  readRecorder,
  resolveDuration,
  resolveToken,
  seedStorage,
  stubPrefs,
  trackErrors,
} from './helpers/header-controls';

declare global {
  interface Window {
    eraLayoutTest: {
      observer: PerformanceObserver;
      sources: { header: boolean; node: string }[];
      collect: (entries: PerformanceEntry[]) => void;
    };
  }
}

const ROOT = `.${ERA_TOGGLE_HOOKS.root}`;
const READY = `${ROOT}[${ERA_TOGGLE_HOOKS.ready}]`;
const BUTTON = `${ROOT} .era-toggle__button`;
const STATUS = `${ROOT} .era-toggle__status`;
const THUMB = `${ROOT} .era-toggle__thumb`;
const TRACK = `${ROOT} .era-toggle__track`;
const FIXTURE = '/dev/era-toggle/1980s';
const dictionaries = { en, pt, es, de, it };
const NINETIES = { id: 'fx-bevel-station-bs95', decade: '1990s', era: '1990s' };
const SEVENTIES = { id: 'fx-relay-replacer-r1', decade: '1960s', era: '1970s' };
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  errors.set(page, trackErrors(page));
  await installRecorder(page);
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  const events = await page.evaluate(() => window.headerControlsTest?.events ?? []);
  for (const event of events) expect(event.era).toBe(event.detail.era);
});

async function open(page: Page, path = FIXTURE) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.locator(READY)).toHaveCount(1);
}

async function ready(page: Page) {
  await expect(page.locator(READY)).toHaveCount(1);
}

function onMessage(era: EraTheme) {
  return en['era.announce_on'].replace('{decade}', en[`decade.${era}`]);
}

async function expectState(page: Page, enabled: boolean, era: string) {
  await expect(page.locator(BUTTON)).toHaveAttribute('aria-checked', String(enabled));
  await expect(page.locator('html')).toHaveAttribute('data-era', era);
  await expect(page.locator(BUTTON)).toHaveAccessibleName(en['era.toggle']);
}

/** Tailwind sr-only (Contract): still rendered and spoken, but a clipped box of at most 1 x 1 px. */
async function expectStatusVisuallyHidden(page: Page) {
  const status = await page.locator(STATUS).evaluate((element) => {
    const { width, height } = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { width, height, overflow: style.overflow, clipPath: style.clipPath };
  });
  expect(status.width).toBeLessThanOrEqual(1);
  expect(status.height).toBeLessThanOrEqual(1);
  expect(status.overflow).toBe('hidden');
  expect(status.clipPath).not.toBe('none');
}

async function dispatch(page: Page, kind: 'center' | 'pageshow', detail: unknown) {
  return page.evaluate(
    ({ kind, detail, eventName }) => {
      const status = document.querySelector('.era-toggle__status')!;
      const before = window.headerControlsTest.events.length;
      const observer = new MutationObserver(() => {});
      observer.observe(status, { childList: true, characterData: true, subtree: true });
      if (kind === 'center') document.dispatchEvent(new CustomEvent(eventName, { detail }));
      else window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: detail === true }));
      const records = observer.takeRecords();
      observer.disconnect();
      return {
        era: document.documentElement.getAttribute('data-era'),
        checked: document.querySelector('.era-toggle__button')!.getAttribute('aria-checked'),
        status: status.textContent,
        added: records
          .flatMap((record) => [...record.addedNodes].map((node) => node.textContent ?? ''))
          .filter(Boolean),
        events: window.headerControlsTest.events.length - before,
        focus: document.activeElement?.id,
        animate: document.querySelector('.era-toggle')!.hasAttribute('data-animate'),
      };
    },
    { kind, detail, eventName: CENTER_CHANGE_EVENT },
  );
}

async function holdModule(page: Page) {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/src/islands/era-toggle/**', async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

async function waitForFixtureStyles(page: Page) {
  await expect(page.locator('footer.site-footer')).toBeAttached();
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()))
    .not.toBe('');
}

test.describe('EraToggle contract', () => {
  test('1: exact markup, announcements and final position in the header', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('switch')).toHaveCount(1);
    await expect(page.locator('button[type="button"].era-toggle__button')).toHaveCount(1);
    await expect(page.locator('.site-header .top > .era-toggle')).toHaveCount(1);
    await expect(page.locator('.site-header .top > :not(script)').last()).toHaveClass('era-toggle');
    await expectState(page, false, 'museum');
    await expect(page.locator('html')).toHaveAttribute('data-page-era', '1980s');
    const attributes = await page
      .locator(ROOT)
      .evaluate((root) =>
        [root, ...root.querySelectorAll('*')].map((element) =>
          Object.fromEntries(
            [...element.attributes]
              .filter(
                ({ name }) => name === 'role' || name === 'tabindex' || name === 'title' || name.startsWith('aria-'),
              )
              .map(({ name, value }) => [name, value]),
          ),
        ),
      );
    expect(attributes).toEqual([
      {},
      { role: 'switch', 'aria-checked': 'false' },
      {},
      { 'aria-hidden': 'true' },
      {},
      { 'aria-live': 'polite', 'aria-atomic': 'true' },
    ]);
    await expect(page.locator(`${BUTTON} .era-toggle__status`)).toHaveCount(0);
    await expect(page.locator(STATUS)).toBeEmpty();
    await expect(page.locator(STATUS)).not.toHaveCSS('display', 'none');
    await expect(page.locator(STATUS)).toHaveCSS('visibility', 'visible');
    await expectStatusVisuallyHidden(page);
    await expect(page.locator(ROOT)).toHaveAttribute('data-announce-off', en['era.announce_off']);
    await expect(page.locator(ROOT)).toHaveAttribute('data-announce-no-era', en['era.announce_on_no_era']);
    for (const era of ERA_THEMES)
      await expect(page.locator(ROOT)).toHaveAttribute(`data-announce-${era}`, onMessage(era));
  });

  test('2: native Tab, Space, Enter and pointer activation preserve focus and state', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.getByRole('link', { name: 'Italiano', exact: true }).focus();
    await page.keyboard.press('Tab');
    const button = page.getByRole('switch');
    await expect(button).toBeFocused();
    const x = () =>
      page.locator(THUMB).evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
    for (const action of ['Space', 'Enter', 'click']) {
      const off = await x();
      if (action === 'click') await button.click();
      else await page.keyboard.press(action);
      await expectState(page, true, '1980s');
      await expect(button).toBeFocused();
      expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.eraUi)).toBe('1');
      expect(await x()).toBeGreaterThan(off);
      if (action === 'click') await button.click();
      else await page.keyboard.press(action);
      await expectState(page, false, 'museum');
      await expect(button).toBeFocused();
      expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.eraUi)).toBeNull();
      expect(await x()).toBe(off);
    }
  });

  test('3: only the visitor toggle announces and stage changes clear without adding text', async ({ page }) => {
    await open(page);
    await expect(page.locator(STATUS)).toBeEmpty();
    await page.getByRole('switch').click();
    await expect(page.locator(STATUS)).toHaveText(onMessage('1980s'));
    // With a message in it, an unhidden status would draw a line of text in the header.
    await expectStatusVisuallyHidden(page);
    expect(await dispatch(page, 'center', NINETIES)).toMatchObject({ era: '1990s', status: '', added: [], events: 1 });
    await page.getByRole('switch').click();
    await expect(page.locator(STATUS)).toHaveText(en['era.announce_off']);
    expect(await dispatch(page, 'center', SEVENTIES)).toMatchObject({
      era: 'museum',
      status: en['era.announce_off'],
      added: [],
      events: 0,
    });
    await page.getByRole('switch').click();
    await expectState(page, true, '1970s');
    await expect(page.locator(STATUS)).toHaveText(onMessage('1970s'));
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEYS.eraUi);
    await open(page, '/dev/era-toggle/none');
    await page.getByRole('switch').click();
    await expectState(page, true, 'museum');
    await expect(page.locator(STATUS)).toHaveText(en['era.announce_on_no_era']);
  });

  test('4: invalid and unchanged details do nothing, valid era overrides act synchronously and keep focus', async ({
    page,
  }) => {
    await open(page);
    const invalid = [{ era: 'museum' }, { era: '1960s' }, {}, undefined];
    for (const detail of invalid)
      expect(await dispatch(page, 'center', detail)).toMatchObject({
        era: 'museum',
        checked: 'false',
        status: '',
        added: [],
        events: 0,
      });
    await page.getByRole('switch').click();
    await expectState(page, true, '1980s');
    expect(await dispatch(page, 'center', { era: '1980s' })).toMatchObject({
      era: '1980s',
      checked: 'true',
      status: onMessage('1980s'),
      added: [],
      events: 0,
    });
    for (const detail of invalid)
      expect(await dispatch(page, 'center', detail)).toMatchObject({
        era: '1980s',
        checked: 'true',
        status: onMessage('1980s'),
        added: [],
        events: 0,
      });
    expect(await dispatch(page, 'center', NINETIES)).toMatchObject({ era: '1990s', events: 1, status: '' });
    const override = { id: 'fx-octal-rack-or5', decade: '1980s', era: '2000s' };
    expect(await dispatch(page, 'center', override)).toMatchObject({ era: '2000s', events: 1 });
    expect(await dispatch(page, 'center', override)).toMatchObject({ era: '2000s', events: 0, added: [] });
    await page.getByRole('switch').click();
    expect(await dispatch(page, 'center', SEVENTIES)).toMatchObject({ era: 'museum', events: 0 });
    await page.getByRole('switch').click();
    await expectState(page, true, '1970s');
    await page.locator('#fixture-link').focus();
    expect(await dispatch(page, 'center', NINETIES)).toMatchObject({ era: '1990s', events: 1, focus: 'fixture-link' });
  });

  test('5: initialization precedes readiness and every changed click writes and emits exactly once', async ({
    page,
  }) => {
    await open(page);
    const initial = await readRecorder(page);
    expect(initial.events).toEqual([{ detail: { enabled: false, era: 'museum' }, era: 'museum', ready: false }]);
    expect(initial.writes).toEqual([]);
    for (const [enabled, era] of [
      [true, '1980s'],
      [false, 'museum'],
    ] as const) {
      const before = await readRecorder(page);
      await page.getByRole('switch').click();
      const after = await readRecorder(page);
      expect(after.events.slice(before.events.length)).toEqual([{ detail: { enabled, era }, era, ready: true }]);
      expect(after.writes.length - before.writes.length).toBe(1);
    }
    expect(await dispatch(page, 'center', SEVENTIES)).toMatchObject({ era: 'museum', events: 0 });
    await open(page, '/dev/era-toggle/none');
    const before = await readRecorder(page);
    await page.getByRole('switch').click();
    const after = await readRecorder(page);
    expect(after.events.slice(before.events.length)).toEqual([
      { detail: { enabled: true, era: 'museum' }, era: 'museum', ready: true },
    ]);
    expect(after.writes).toEqual(before.writes);
  });

  for (const stubbed of [false, true]) {
    test(`5/6: stored on state initializes once and persists with prefs ${stubbed ? 'stubbed' : 'active'}`, async ({
      page,
    }) => {
      if (stubbed) await stubPrefs(page);
      await open(page);
      expect(await prefsStubRan(page)).toBe(stubbed);
      await seedStorage(page, STORAGE_KEYS.eraUi, '1');
      await ready(page);
      // Every document of the stubbed run must have run the stub, or the toggle's write below is unproven.
      expect(await prefsStubRan(page)).toBe(stubbed);
      await expectState(page, true, '1980s');
      const recorded = await readRecorder(page);
      expect(recorded.events).toEqual([{ detail: { enabled: true, era: '1980s' }, era: '1980s', ready: false }]);
      expect(recorded.writes).toHaveLength(1);
      await expect(page.locator(STATUS)).toBeEmpty();
      await page.reload();
      await ready(page);
      expect(await prefsStubRan(page)).toBe(stubbed);
      await expectState(page, true, '1980s');
      await expect(page.locator('body')).toBeFocused();
      await open(page, '/dev/era-toggle/none');
      expect(await prefsStubRan(page)).toBe(stubbed);
      await expectState(page, true, 'museum');
      await expect(page.locator(STATUS)).toBeEmpty();
      await page.getByRole('switch').click();
      await expectState(page, false, 'museum');
    });
  }

  test('6: only the exact stored value 1 enables the switch', async ({ page }) => {
    await open(page);
    for (const value of ['0', 'true', '', 'on']) {
      await seedStorage(page, STORAGE_KEYS.eraUi, value);
      await ready(page);
      await expectState(page, false, 'museum');
      await expect(page.locator(STATUS)).toBeEmpty();
      await page.getByRole('switch').click();
      await expectState(page, true, '1980s');
    }
  });

  test('6: persisted pageshow synchronizes once, clears status and keeps focus without animation', async ({ page }) => {
    await open(page);
    await seedStorage(page, STORAGE_KEYS.eraUi, '1');
    await ready(page);
    await page.getByRole('switch').click();
    await expect(page.locator(STATUS)).toHaveText(en['era.announce_off']);
    await page.evaluate((key) => localStorage.setItem(key, '1'), STORAGE_KEYS.eraUi);
    expect(await dispatch(page, 'pageshow', false)).toMatchObject({
      era: 'museum',
      checked: 'false',
      events: 0,
      status: en['era.announce_off'],
    });
    await page.locator('#fixture-link').focus();
    expect(await dispatch(page, 'pageshow', true)).toMatchObject({
      era: '1980s',
      checked: 'true',
      events: 1,
      status: '',
      added: [],
      focus: 'fixture-link',
      animate: false,
    });
    expect(await dispatch(page, 'pageshow', true)).toMatchObject({
      era: '1980s',
      events: 0,
      added: [],
      focus: 'fixture-link',
    });
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEYS.eraUi);
    expect(await dispatch(page, 'pageshow', true)).toMatchObject({
      era: 'museum',
      checked: 'false',
      events: 1,
      status: '',
      added: [],
      focus: 'fixture-link',
    });
  });

  for (const failure of ['getter', 'methods'] as const) {
    test(`7: ${failure} storage failures leave clicks usable and reload off`, async ({ page }) => {
      await failStorage(page, failure);
      await open(page);
      await expectState(page, false, 'museum');
      await page.getByRole('switch').click();
      await expectState(page, true, '1980s');
      expect(await dispatch(page, 'pageshow', true)).toMatchObject({
        era: '1980s',
        checked: 'true',
        status: onMessage('1980s'),
        added: [],
        events: 0,
      });
      await page.getByRole('switch').click();
      await expectState(page, false, 'museum');
      await page.reload();
      await ready(page);
      await expectState(page, false, 'museum');
      expect((await readRecorder(page)).events).toHaveLength(1);
    });
  }

  test('8: the hidden pre-init switch reserves its complete header box without layout shift', async ({ page }) => {
    await page.addInitScript(() => {
      const sources: { header: boolean; node: string }[] = [];
      const collect = (entries: PerformanceEntry[]) => {
        for (const entry of entries) {
          const shift = entry as PerformanceEntry & { sources: { node?: Node }[] };
          for (const { node } of shift.sources) {
            const element = node instanceof Element ? node : node?.parentElement;
            sources.push({ header: !!element?.closest('.site-header'), node: element?.outerHTML.slice(0, 120) ?? '' });
          }
        }
      };
      const observer = new PerformanceObserver((entries) => collect(entries.getEntries()));
      window.eraLayoutTest = { observer, sources, collect };
      observer.observe({ type: 'layout-shift', buffered: true });
    });
    const release = await holdModule(page);
    const geometry = () =>
      page.locator(BUTTON).evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          header: document.querySelector('.site-header')!.getBoundingClientRect().height,
        };
      });
    let before: Awaited<ReturnType<typeof geometry>>;
    try {
      await page.goto(FIXTURE, { waitUntil: 'commit' });
      await waitForFixtureStyles(page);
      await expect(page.locator(ROOT)).not.toHaveAttribute('data-ready');
      await expect(page.locator(BUTTON)).toHaveCSS('visibility', 'hidden');
      before = await geometry();
      expect(before.width).toBeGreaterThanOrEqual(44);
      expect(before.height).toBeGreaterThanOrEqual(44);
    } finally {
      release();
    }
    await ready(page);
    await expect(page.getByRole('switch')).toBeVisible();
    expect(await geometry()).toEqual(before!);
    const sources = await page.evaluate(() => {
      const state = window.eraLayoutTest;
      state.collect(state.observer.takeRecords());
      return state.sources.filter((source) => source.header);
    });
    expect(sources).toEqual([]);
    await page.getByRole('switch').click();
    await expectState(page, true, '1980s');
  });

  test('9: only visitor clicks animate the thumb using the motion token', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page);
    await seedStorage(page, STORAGE_KEYS.eraUi, '1');
    await ready(page);
    const release = await holdModule(page);
    try {
      await page.reload({ waitUntil: 'commit' });
      await waitForFixtureStyles(page);
      await expect(page.locator(ROOT)).not.toHaveAttribute('data-ready');
      expect(await page.locator(THUMB).evaluate((thumb) => getComputedStyle(thumb).transform)).toBe('none');
    } finally {
      release();
    }
    await ready(page);
    await expectState(page, true, '1980s');
    expect((await readRecorder(page)).transitions).toEqual([]);
    await page.getByRole('switch').click();
    await expect.poll(async () => (await readRecorder(page)).transitions).toEqual([{ propertyName: 'transform' }]);
    await expect(page.locator(THUMB)).toHaveCSS('transition-property', 'transform');
    const milliseconds = await page
      .locator(THUMB)
      .evaluate((thumb) => parseFloat(getComputedStyle(thumb).transitionDuration) * 1000);
    expect(milliseconds).toBe(await resolveDuration(page, '--motion-fast'));
    await page.evaluate((key) => localStorage.setItem(key, '1'), STORAGE_KEYS.eraUi);
    expect(await dispatch(page, 'pageshow', true)).toMatchObject({ checked: 'true', animate: false, events: 1 });
    await page.getByRole('switch').click();
    await expect
      .poll(async () => (await readRecorder(page)).transitions)
      .toEqual([{ propertyName: 'transform' }, { propertyName: 'transform' }]);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator(THUMB)).toHaveCSS('transition-duration', '0s');
    await page.getByRole('switch').click();
    await expectState(page, true, '1980s');
  });

  test('10: keyboard focus uses the solid semantic focus color in both states', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: 'Italiano', exact: true }).focus();
    await page.keyboard.press('Tab');
    for (const enabled of [false, true]) {
      if (enabled) await page.keyboard.press('Space');
      await expectState(page, enabled, enabled ? '1980s' : 'museum');
      await expect(page.getByRole('switch')).toBeFocused();
      await expect(page.getByRole('switch')).toHaveCSS('outline-style', 'solid');
      await expect(page.getByRole('switch')).toHaveCSS(
        'outline-color',
        await resolveToken(page, '--color-focus', 'color'),
      );
    }
  });

  for (const lang of LANGS) {
    for (const [width, fontSize] of [
      [320, 16],
      [390, 16],
      [390, 32],
    ] as const) {
      test(`11: ${lang} header fits ${width}px with ${fontSize}px standard fonts`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 800 });
        const session = await context.newCDPSession(page);
        await session.send('Page.setFontSizes', { fontSizes: { standard: fontSize } });
        await open(page, `/${lang}/about`);
        await expect(page.locator('.site-header .top > .era-toggle')).toHaveCount(1);
        await expect(page.locator('.site-header .top > :not(script)').last()).toHaveClass('era-toggle');
        await expect(page.getByRole('switch')).toHaveAccessibleName(dictionaries[lang]['era.toggle']);
        const size = await page.getByRole('switch').boundingBox();
        expect(size).not.toBeNull();
        if (width === 390) {
          expect(size!.width).toBeGreaterThanOrEqual(44);
          expect(size!.height).toBeGreaterThanOrEqual(44);
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        ).toBe(true);
        await session.detach();
      });
    }
  }

  for (const path of [FIXTURE, '/en/about']) {
    test(`12: without scripting the switch is absent from layout and accessibility on ${path}`, async ({
      browser,
      baseURL,
    }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
      const page = await context.newPage();
      const failures = trackErrors(page);
      await page.goto(path);
      await expect(page.locator(`${ROOT} button[role="switch"]`)).toHaveCount(1);
      await expect(page.locator(ROOT)).toHaveCSS('display', 'none');
      expect(await page.locator(ROOT).boundingBox()).toBeNull();
      expect(await page.locator('.site-header').ariaSnapshot()).not.toContain('switch');
      await expect(page.locator('.site-header .brand')).toBeVisible();
      await expect(page.getByRole('link', { name: 'English', exact: true })).toBeVisible();
      expect(failures).toEqual([]);
      await context.close();
    });
  }

  for (const scenario of ['none', ...ERA_THEMES]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`13: ${scenario} ${colorScheme} uses the theme radius tokens`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await open(page, `/dev/era-toggle/${scenario}`);
        await page.getByRole('switch').click();
        await expectState(page, true, scenario === 'none' ? 'museum' : scenario);
        await expect(page.locator(TRACK)).toHaveCSS(
          'border-top-left-radius',
          await resolveToken(page, '--radius-lg', 'border-top-left-radius'),
        );
        await expect(page.locator(THUMB)).toHaveCSS(
          'border-top-left-radius',
          await resolveToken(page, '--radius-md', 'border-top-left-radius'),
        );
      });
    }
  }

  test('14: forced colors retain visible track and thumb borders in both states', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page);
    for (const enabled of [false, true]) {
      if (enabled) await page.getByRole('switch').click();
      await expectState(page, enabled, enabled ? '1980s' : 'museum');
      await expect(page.locator(TRACK)).not.toHaveCSS('border-top-style', 'none');
      await expect(page.locator(THUMB)).not.toHaveCSS('border-top-style', 'none');
      expect(
        await page.locator(THUMB).evaluate((thumb) => parseFloat(getComputedStyle(thumb).borderTopWidth)),
      ).toBeGreaterThanOrEqual(1);
    }
  });
});

test.describe('EraToggle captures', () => {
  for (const width of [390, 1280]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      const scenarios = colorScheme === 'light' ? ['off', ...ERA_THEMES] : ['off', '1980s'];
      for (const scenario of scenarios) {
        test(`${width}px ${scenario} ${colorScheme}`, async ({ page }, testInfo) => {
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
          await open(page, `/dev/era-toggle/${scenario === 'off' ? '1980s' : scenario}`);
          if (scenario !== 'off') await page.getByRole('switch').click();
          await expectState(page, scenario !== 'off', scenario === 'off' ? 'museum' : scenario);
          const path = testInfo.outputPath(`era-toggle-${width}-${scenario}-${colorScheme}.png`);
          // Keep the header and fixture in the capture, excluding the footer's contact details.
          const height = await page
            .locator('footer.site-footer')
            .evaluate((footer) => footer.getBoundingClientRect().top);
          await page.screenshot({ path, animations: 'disabled', clip: { x: 0, y: 0, width, height } });
          await testInfo.attach('EraToggle fixture', { path, contentType: 'image/png' });
        });
      }
    }
  }
});
