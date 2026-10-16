import { expect, test, type Page } from '@playwright/test';
import en from '../../src/i18n/en.json' with { type: 'json' };
import { LANGS, LANG_TAGS } from '../../src/i18n/langs';
import { LANGUAGE_HOOKS, STORAGE_KEYS } from '../../src/islands/contracts';
import { failStorage, trackErrors } from './helpers/header-controls';

const NAV = `nav.languages.${LANGUAGE_HOOKS.nav}`;
const READY = `${NAV}[${LANGUAGE_HOOKS.ready}]`;

async function openLanguages(page: Page, path = '/en/about'): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.locator(READY)).toHaveCount(1);
}

test('language links retain their static markup, order and current-language marks', async ({ page }) => {
  const errors = trackErrors(page);
  for (const [path, suffix, current] of [
    ['/en/about', '/about', 'page'],
    ['/dev/era-toggle/none', '/', 'true'],
  ] as const) {
    await openLanguages(page, path);
    const nav = page.locator(NAV);
    await expect(nav).toHaveCount(1);
    await expect(nav).toHaveAccessibleName(en['nav.languages']);
    const links = nav.locator(`a[${LANGUAGE_HOOKS.lang}]`);
    await expect(links).toHaveCount(LANGS.length);
    for (const [index, lang] of LANGS.entries()) {
      const link = links.nth(index);
      await expect(link).toHaveAttribute(LANGUAGE_HOOKS.lang, lang);
      await expect(link).toHaveAttribute('href', `/${lang}${suffix}`);
      await expect(link).toHaveAttribute('hreflang', LANG_TAGS[lang]);
      await expect(link).toHaveAttribute('lang', LANG_TAGS[lang]);
      await expect(link).toHaveAccessibleName(en[`lang.${lang}`]);
    }
    await expect(nav.locator('[aria-current]')).toHaveCount(1);
    await expect(nav.locator(`[${LANGUAGE_HOOKS.lang}="en"]`)).toHaveAttribute('aria-current', current);
    await expect(nav.locator('[aria-live]')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('only plain clicks and Enter remember the selected language', async ({ page, context }) => {
  const errors = trackErrors(page);
  await openLanguages(page);
  const portuguese = page.locator(NAV).getByRole('link', { name: en['lang.pt'], exact: true });
  for (const options of [
    { button: 'middle' as const },
    { modifiers: ['ControlOrMeta' as const] },
    { modifiers: ['Shift' as const] },
  ]) {
    const [opened] = await Promise.all([context.waitForEvent('page'), portuguese.click(options)]);
    await opened.waitForURL('**/pt/about');
    await opened.close();
    expect(new URL(page.url()).pathname).toBe('/en/about');
    expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEYS.lang)).toBeNull();
  }

  // Chromium sends no click for a real middle button (auxclick only), and Windows and Linux have no Meta click, so
  // the real clicks above cannot fail on the button or metaKey checks, nor reach altKey or defaultPrevented.
  // Synthetic clicks reach the nav's listener with each property; a document listener, after the nav's, keeps the page.
  const syntheticClick = (init: Pick<MouseEventInit, 'button' | 'altKey' | 'metaKey'>, cancelOnLink = false) =>
    page.evaluate(
      ({ selector, init, cancelOnLink, key }) => {
        const link = document.querySelector(selector)!;
        const prevent = (event: Event) => event.preventDefault();
        document.addEventListener('click', prevent);
        // A capture listener on the target runs before the nav's bubble listener sees the event.
        if (cancelOnLink) link.addEventListener('click', prevent, { capture: true });
        const notCancelled = link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
        document.removeEventListener('click', prevent);
        link.removeEventListener('click', prevent, { capture: true });
        return { notCancelled, stored: window.localStorage.getItem(key) };
      },
      { selector: `${NAV} a[${LANGUAGE_HOOKS.lang}="pt"]`, init, cancelOnLink, key: STORAGE_KEYS.lang },
    );
  for (const [init, cancelOnLink] of [
    [{ button: 1 }, false],
    [{ altKey: true }, false],
    [{ metaKey: true }, false],
    [{}, true],
  ] as const) {
    expect(await syntheticClick(init, cancelOnLink), JSON.stringify({ init, cancelOnLink })).toEqual({
      notCancelled: false,
      stored: null,
    });
    expect(new URL(page.url()).pathname).toBe('/en/about');
  }
  // The same harness with a plain click does reach the listener.
  expect(await syntheticClick({})).toEqual({ notCancelled: false, stored: 'pt' });
  expect(new URL(page.url()).pathname).toBe('/en/about');

  await page.locator(NAV).getByRole('link', { name: en['lang.en'], exact: true }).click();
  await expect(page.locator(READY)).toHaveCount(1);
  expect(new URL(page.url()).pathname).toBe('/en/about');
  expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEYS.lang)).toBe('en');

  await portuguese.click();
  await page.waitForURL('**/pt/about');
  await expect(page.locator(READY)).toHaveCount(1);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEYS.lang)).toBe('pt');

  const german = page.locator(NAV).getByRole('link', { name: en['lang.de'], exact: true });
  await german.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/de/about');
  await expect(page.locator(READY)).toHaveCount(1);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEYS.lang)).toBe('de');
  expect(errors).toEqual([]);
});

for (const variant of ['getter', 'methods'] as const) {
  test(`a plain link still navigates when the storage ${variant} throws`, async ({ page }) => {
    const errors = trackErrors(page);
    await failStorage(page, variant);
    await openLanguages(page);
    expect(
      await page.evaluate(() => {
        try {
          window.localStorage.setItem('header-controls-probe', '1');
          return false;
        } catch (error) {
          return error instanceof DOMException && error.name === 'SecurityError';
        }
      }),
    ).toBe(true);
    await page.locator(NAV).getByRole('link', { name: en['lang.pt'], exact: true }).click();
    await page.waitForURL('**/pt/about');
    await expect(page.locator(READY)).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', LANG_TAGS.pt);
    expect(errors).toEqual([]);
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the language links still navigate', async ({ page }) => {
    const errors = trackErrors(page);
    const response = await page.goto('/en/about');
    expect(response?.status()).toBe(200);
    await expect(page.locator(NAV)).toHaveCount(1);
    await expect(page.locator(READY)).toHaveCount(0);
    await page.locator(NAV).getByRole('link', { name: en['lang.pt'], exact: true }).click();
    await page.waitForURL('**/pt/about');
    await expect(page.locator('html')).toHaveAttribute('lang', LANG_TAGS.pt);
    expect(errors).toEqual([]);
  });
});
