// /prefs.js (ADR-0012) against `wrangler dev` over the production build (project "edge", which runs every
// *edge.spec.ts): the head ends with it, classic and blocking, under a content-hashed name the browser keeps; the
// first frame already wears the stored era; a remembered language replaces the home the "/" redirect chose before
// that home gets a body. Only the Worker answers "/" with a redirect, so this cannot run against `astro dev`.
import { expect, test, type Page } from '@playwright/test';
import { ERA_HOOKS, STORAGE_KEYS } from '../../src/islands/contracts';

const DECADE_PAGE = '/en/decades/1980s';
// The build serves public/prefs.js as /_astro/prefs.<hash>.js (astro.config.mjs, placePrefsScript), named the way
// Vite names its own output: the first 8 characters of the base64url SHA-256 of the content.
const PREFS_SRC = /^\/_astro\/prefs\.([A-Za-z0-9_-]{8})\.js$/;
const IMMUTABLE = 'private, max-age=31536000, immutable';

async function contentHash(body: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(body)));
  const base64 = btoa(String.fromCharCode(...digest));
  return base64.replaceAll('+', '-').replaceAll('/', '_').slice(0, 8);
}

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

/**
 * Records, in sessionStorage, every document the tab opens ("false") and whether the parser ever gave it a body
 * ("true"). A mutation observer rather than pagehide: WebKit fires no pagehide for a document stopped in its <head>.
 */
async function recordBodies(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const key = `body ${location.pathname}`;
    sessionStorage.setItem(key, 'false');
    new MutationObserver((_records, observer) => {
      if (document.body === null) return;
      sessionStorage.setItem(key, 'true');
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
}

// The build moves the script to the end of <head> (astro.config.mjs, placePrefsScript): in front of Astro's CSP
// meta it held back every stylesheet request in Chromium by one round trip. It still blocks rendering there.
test('every page ends <head> with /prefs.js, classic and blocking, after the CSP meta and the stylesheets', async ({
  request,
}) => {
  const sources = new Set<string>();
  for (const path of [DECADE_PAGE, '/en/', '/en/about', '/en/does-not-exist']) {
    const html = await (await request.get(path, { maxRedirects: 0 })).text();
    const head = html.slice(0, html.search(/<\/head>/i));
    const scripts = head.match(/<script\b[^>]*>/g) ?? [];
    const src = /^<script src="([^"]+)">$/.exec(scripts.at(-1) ?? '')?.[1] ?? '';
    expect(src, `${path}: no async, defer or type, a classic parser-blocking script`).toMatch(PREFS_SRC);
    expect(head.trimEnd().endsWith(`<script src="${src}"></script>`), `${path}: the last element of <head>`).toBe(true);
    const lastStylesheet = [...head.matchAll(/<link\b[^>]*\brel="stylesheet"/g)].at(-1)?.index ?? -1;
    const cspMeta = head.search(/<meta http-equiv="content-security-policy"/);
    expect(lastStylesheet, `${path}: a stylesheet in <head>`).toBeGreaterThan(-1);
    expect(cspMeta, `${path}: Astro's CSP meta in <head>`).toBeGreaterThan(-1);
    expect(head.indexOf(`<script src="${src}">`)).toBeGreaterThan(Math.max(lastStylesheet, cspMeta));
    sources.add(src);
  }
  expect(sources.size, 'one script URL on every page').toBe(1);

  const [src = ''] = sources;
  const script = await request.get(src, { maxRedirects: 0 });
  expect(script.status()).toBe(200);
  expect(script.headers()['content-type']).toContain('javascript');
  expect(script.headers()['cache-control']).toBe(IMMUTABLE);
  const body = await script.body();
  expect(await contentHash(body), 'the name carries the hash of what it serves').toBe(PREFS_SRC.exec(src)?.[1]);
  expect(await script.text()).toContain(STORAGE_KEYS.eraUi);
  // The hashed name is the only one: nothing is left to revalidate at /prefs.js.
  expect((await request.get('/prefs.js', { maxRedirects: 0 })).status()).toBe(404);
});

// Before, a page view revalidated every stylesheet and /prefs.js (one 304 each) before first paint.
test('a second page view takes the stylesheets and /prefs.js from the browser cache, asking the server nothing', async ({
  page,
}) => {
  const resources = () =>
    page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => [new URL(entry.name).pathname, (entry as PerformanceResourceTiming).transferSize] as const),
    );
  await page.goto('/en/about');
  const first = new Map(await resources());
  await page.goto('/en/privacy');
  // transferSize is 0 only when the cache answered alone; a revalidation counts the headers of the 304.
  const shared = (await resources()).filter(([path]) => first.has(path));
  expect(shared.map(([path]) => path)).toEqual(
    expect.arrayContaining([expect.stringMatching(PREFS_SRC), expect.stringMatching(/^\/_astro\/.+\.css$/)]),
  );
  expect(
    shared.filter(([path]) => !first.get(path)),
    'fetched from the server on the first view',
  ).toEqual([]);
  expect(
    shared.filter(([, transferSize]) => transferSize !== 0),
    'reached the server on the second view',
  ).toEqual([]);
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
    await recordBodies(page);
    // Wait only for the redirected /en/ document to commit: /prefs.js stops it before its load event.
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForURL('**/pt/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    const bodyOf = (path: string) => page.evaluate((key) => sessionStorage.getItem(key), `body ${path}`);
    // The probe sees a body where there is one, so its silence on /en/ means something.
    await expect.poll(() => bodyOf('/pt/')).toBe('true');
    // Opened but never given a body: the English home had nothing to paint and nothing for a screen reader to read.
    expect(await bodyOf('/en/')).toBe('false');
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
