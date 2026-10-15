// /prefs.js (ADR-0012) against `wrangler dev` over the production build (project "edge", which runs every
// *edge.spec.ts): the head loads it first and blocking, the first frame already wears the stored era, and a
// remembered language replaces the home the "/" redirect chose before that home gets a body. Only the Worker
// answers "/" with a redirect, so this cannot run against `astro dev`.
import { expect, test, type Page } from '@playwright/test';
import { ERA_HOOKS, STORAGE_KEYS } from '../../src/islands/contracts';

const DECADE_PAGE = '/en/decades/1980s';

/** Console errors and uncaught exceptions; Chrome reports a script refused by the CSP as a console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Stores preferences for the origin from a page that /prefs.js leaves alone, as a past visit would have. */
async function remember(page: Page, preferences: Record<string, string>): Promise<void> {
  await page.goto('/en/about');
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, preferences);
}

/**
 * Records, in sessionStorage (it survives same-origin navigations in the tab), the era of every document in its first
 * animation frames: rAF callbacks run right before a frame is painted, so this is what the visitor could see.
 */
async function recordFrames(page: Page): Promise<void> {
  await page.addInitScript((attribute) => {
    const onFrame = () => {
      const key = `frames ${location.pathname}`;
      const frames = JSON.parse(sessionStorage.getItem(key) ?? '[]') as (string | null)[];
      frames.push(document.documentElement.getAttribute(attribute));
      sessionStorage.setItem(key, JSON.stringify(frames));
      if (frames.length < 5) requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);
  }, ERA_HOOKS.applied);
}

/** The era of each recorded frame of a document, oldest first. */
async function framesOf(page: Page, path: string): Promise<(string | null)[]> {
  return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? '[]'), `frames ${path}`);
}

/** Records, in sessionStorage, whether each document the tab leaves ever got a body (the parser reached it). */
async function recordBodyOnLeave(page: Page): Promise<void> {
  await page.addInitScript(() => {
    addEventListener('pagehide', () =>
      sessionStorage.setItem(`left ${location.pathname}`, String(document.body !== null)),
    );
  });
}

test('every page loads /prefs.js first in <head>, classic and blocking, before the stylesheet', async ({ request }) => {
  const html = await (await request.get(DECADE_PAGE, { maxRedirects: 0 })).text();
  const head = html.slice(0, html.search(/<\/head>/i));
  const firstScript = head.match(/<script\b[^>]*>/)?.[0];
  expect(firstScript, 'no async, defer or type: a classic, parser-blocking script').toBe('<script src="/prefs.js">');
  const stylesheet = head.search(/<link\b[^>]*\brel="stylesheet"/);
  expect(stylesheet, 'a stylesheet in <head>').toBeGreaterThan(-1);
  expect(head.indexOf(firstScript ?? '')).toBeLessThan(stylesheet);

  const script = await request.get('/prefs.js', { maxRedirects: 0 });
  expect(script.status()).toBe(200);
  expect(script.headers()['content-type']).toContain('javascript');
});

test('the first frame of a page already wears the stored era', async ({ page }) => {
  const errors = collectErrors(page);
  await remember(page, { [STORAGE_KEYS.eraUi]: '1' });
  await recordFrames(page);
  await page.goto(DECADE_PAGE);
  await expect(page.locator('html')).toHaveAttribute(ERA_HOOKS.page, '1980s');
  await expect.poll(async () => (await framesOf(page, DECADE_PAGE)).length).toBeGreaterThan(0);
  const frames = await framesOf(page, DECADE_PAGE);
  expect(frames).toEqual(frames.map(() => '1980s'));
  expect(errors).toEqual([]);
});

test('without Era UI on, the first frame wears the museum theme', async ({ page }) => {
  await recordFrames(page);
  await page.goto(DECADE_PAGE);
  await expect.poll(async () => (await framesOf(page, DECADE_PAGE)).length).toBeGreaterThan(0);
  expect((await framesOf(page, DECADE_PAGE))[0]).toBe('museum');
});

test.describe('a remembered language', () => {
  test.use({ extraHTTPHeaders: { 'Accept-Language': 'en' } });

  test('replaces the home the "/" redirect chose, before it gets a body', async ({ page }) => {
    const errors = collectErrors(page);
    await remember(page, { [STORAGE_KEYS.lang]: 'pt' });
    await recordBodyOnLeave(page);
    // Wait only for the redirected /en/ document to commit: /prefs.js stops it before its load event.
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForURL('**/pt/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    // Without a body the English home had nothing to paint and nothing for a screen reader to read.
    expect(await page.evaluate(() => sessionStorage.getItem('left /en/'))).toBe('false');
    // Replaced, not pushed: Back leads to the page before "/", never to the English home.
    await page.goBack();
    expect(new URL(page.url()).pathname).toBe('/en/about');
    expect(errors).toEqual([]);
  });

  test('leaves a home the visitor asked for alone', async ({ page }) => {
    await remember(page, { [STORAGE_KEYS.lang]: 'pt' });
    await page.goto('/en/');
    await page.waitForLoadState('load');
    expect(new URL(page.url()).pathname).toBe('/en/');
  });

  test('is ignored when it matches the redirect', async ({ page }) => {
    await remember(page, { [STORAGE_KEYS.lang]: 'en' });
    await page.goto('/');
    expect(new URL(page.url()).pathname).toBe('/en/');
  });
});
