// What only the Worker does, checked against `wrangler dev` over the production build (playwright.config.ts, project
// "edge"): the "/" redirect, the security headers, /api, the 404 pages and island hydration under the CSP. Requests
// never follow redirects, so the Worker's own answer is what gets checked.
import { expect, test, type APIResponse, type Page } from '@playwright/test';
import en from '../../src/i18n/en.json' with { type: 'json' };
import { CENTER_CHANGE_EVENT, type CenterChangeDetail } from '../../src/islands/contracts';
import { SECURITY_HEADERS } from '../../worker/src/security-headers';

declare global {
  interface Window {
    coverFlowEdge: { centers: string[]; violations: string[] };
  }
}

const NO_REDIRECTS = { maxRedirects: 0 } as const;
const HASH_SOURCE = /^'sha(256|384|512)-[A-Za-z0-9+/]+={0,2}'$/;

/** The hash sources of one directive, unquoted, in the order the policy lists them. */
function hashesIn(policy: string, directive: string): string[] {
  const sources = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([name]) => name === directive);
  return (sources ?? []).filter((source) => HASH_SOURCE.test(source)).map((source) => source.slice(1, -1));
}

// The CSP every response must carry: the documented policy plus the island hashes of the build's csp.json, added to
// script-src and style-src (ADR-0010). Spelled out with string replacement rather than worker/src/csp.ts.
let expectedPolicy = '';
let manifest: Record<string, string[]> = {};

test.beforeAll(async ({ playwright }, testInfo) => {
  const context = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  manifest = (await (await context.get('/csp.json', NO_REDIRECTS)).json()) as Record<string, string[]>;
  await context.dispose();
  const quoted = (directive: string) => (manifest[directive] ?? []).map((hash) => ` '${hash}'`).join('');
  expectedPolicy = SECURITY_HEADERS['Content-Security-Policy']
    .replace("script-src 'self';", `script-src 'self'${quoted('script-src')};`)
    .replace("style-src 'self';", `style-src 'self'${quoted('style-src')};`);
});

function expectSecurityHeaders(response: APIResponse): void {
  const headers = response.headers();
  const expected = { ...SECURITY_HEADERS, 'Content-Security-Policy': expectedPolicy };
  for (const [name, value] of Object.entries(expected)) expect(headers[name.toLowerCase()], name).toBe(value);
}

// The deliberate 404s show up as failed resource loads, which are not a policy problem. Anchored, because a CSP
// refusal quotes base64 hashes that may contain "404".
const NOT_FOUND_LOAD = /^Failed to load resource: the server responded with a status of 404/;

/** Console errors and uncaught exceptions; Chrome reports every refused inline script or style as a console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !NOT_FOUND_LOAD.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('language redirect on /', () => {
  for (const [acceptLanguage, location] of [
    ['pt-BR,pt;q=0.9,en;q=0.8', '/pt/?auto'],
    ['de-DE', '/de/?auto'],
    ['fr-FR,es;q=0.5', '/es/?auto'],
    ['it-CH', '/it/?auto'],
    ['en;q=0,pt;q=0.1', '/pt/?auto'],
    ['fr-FR', '/en/?auto'],
    ['*', '/en/?auto'],
  ] as const) {
    test(`Accept-Language "${acceptLanguage}" goes to ${location}`, async ({ request }) => {
      const response = await request.get('/', { ...NO_REDIRECTS, headers: { 'Accept-Language': acceptLanguage } });
      expect(response.status()).toBe(302);
      const headers = response.headers();
      expect(headers['location']).toBe(location);
      expect(headers['vary']).toBe('Accept-Language');
      expect(headers['set-cookie']).toBeUndefined();
      expectSecurityHeaders(response);
    });
  }
});

test.describe('security headers', () => {
  test('on an HTML page', async ({ request }) => {
    const response = await request.get('/en/', NO_REDIRECTS);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expectSecurityHeaders(response);
  });

  test('on a stylesheet', async ({ request }) => {
    const html = await (await request.get('/en/', NO_REDIRECTS)).text();
    const stylesheet = [...html.matchAll(/<link\b[^>]*>/g)]
      .map(([tag]) => tag)
      .find((tag) => /\brel="stylesheet"/.test(tag));
    const href = stylesheet?.match(/\bhref="([^"]+)"/)?.[1];
    expect(href, 'a <link rel="stylesheet"> in /en/').toBeTruthy();
    const response = await request.get(href ?? '', NO_REDIRECTS);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/css');
    expectSecurityHeaders(response);
  });

  test('on /api/health', async ({ request }) => {
    expectSecurityHeaders(await request.get('/api/health', NO_REDIRECTS));
  });

  test('on a 404 page', async ({ request }) => {
    const response = await request.get('/en/does-not-exist', NO_REDIRECTS);
    expect(response.status()).toBe(404);
    expectSecurityHeaders(response);
  });

  // Without hashes in csp.json, every comparison above would only prove the documented policy.
  test('/csp.json lists the island hashes the CSP adds', () => {
    expect(manifest['script-src'], 'script hashes').not.toHaveLength(0);
    expect(manifest['style-src'], 'style hashes').not.toHaveLength(0);
    expect(expectedPolicy).not.toBe(SECURITY_HEADERS['Content-Security-Policy']);
  });
});

// Files under /_astro/ have content-hashed names, so browsers may keep them for a year without asking; everything
// else keeps the assets binding default and is revalidated on every use, so a deploy reaches visitors at once.
test.describe('Cache-Control', () => {
  const IMMUTABLE = 'private, max-age=31536000, immutable';
  const REVALIDATE = 'public, max-age=0, must-revalidate';

  test('a year, immutable, on every /_astro/ file a page names', async ({ request }) => {
    const urls = new Set<string>();
    for (const path of ['/en/about', '/e2e/islands']) {
      const html = await (await request.get(path, NO_REDIRECTS)).text();
      for (const [, url = ''] of html.matchAll(/"(\/_astro\/[^"]+)"/g)) urls.add(url);
    }
    // Stylesheets, /prefs.js, island components and the React renderer.
    expect(
      [...urls].filter((url) => url.endsWith('.css')),
      'stylesheets',
    ).not.toHaveLength(0);
    expect([...urls].filter((url) => url.endsWith('.js')).length, 'scripts').toBeGreaterThan(2);
    for (const url of urls) {
      const response = await request.get(url, NO_REDIRECTS);
      expect(response.status(), url).toBe(200);
      expect(response.headers()['cache-control'], url).toBe(IMMUTABLE);
    }
  });

  for (const [name, path, status] of [
    ['an HTML page', '/en/about', 200],
    ['a 404 page', '/en/does-not-exist', 404],
    ['a missing file under /_astro/', '/_astro/missing.AAAAAAAA.js', 404],
    ['a file outside /_astro/', '/favicon.svg', 200],
    ['csp.json', '/csp.json', 200],
  ] as const) {
    test(`revalidated on ${name}`, async ({ request }) => {
      const response = await request.get(path, NO_REDIRECTS);
      expect(response.status()).toBe(status);
      expect(response.headers()['cache-control']).toBe(REVALIDATE);
    });
  }

  // The binding answers a matching If-None-Match with a 304 for its 404 page too; the Worker asks it about /_astro/
  // without validators, so a stored 404 can never come back immutable.
  test('asked again with its ETag, a missing /_astro/ file stays a revalidating 404', async ({ request }) => {
    const path = '/_astro/missing.AAAAAAAA.js';
    const etag = (await request.get(path, NO_REDIRECTS)).headers()['etag'] ?? '';
    expect(etag, 'the 404 page carries an ETag').not.toBe('');
    const response = await request.get(path, { ...NO_REDIRECTS, headers: { 'If-None-Match': etag } });
    expect(response.status()).toBe(404);
    expect(response.headers()['cache-control']).toBe(REVALIDATE);
  });

  test('asked again with its ETag, a /_astro/ file comes back whole and immutable', async ({ request }) => {
    const html = await (await request.get('/en/about', NO_REDIRECTS)).text();
    const href = /<link rel="stylesheet" href="(\/_astro\/[^"]+\.css)"/.exec(html)?.[1] ?? '';
    const etag = (await request.get(href, NO_REDIRECTS)).headers()['etag'] ?? '';
    expect(etag, `${href} carries an ETag`).not.toBe('');
    const response = await request.get(href, { ...NO_REDIRECTS, headers: { 'If-None-Match': etag } });
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe(IMMUTABLE);
  });
});

test.describe('/api', () => {
  test('GET /api/health answers ok, the build and its date, nothing else', async ({ request }) => {
    const response = await request.get('/api/health', NO_REDIRECTS);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['cache-control']).toBe('no-store');
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['build', 'date', 'ok']);
    expect(body['ok']).toBe(true);
    expect(typeof body['build']).toBe('string');
    const date = body['date'];
    expect(date === null || (typeof date === 'string' && !Number.isNaN(Date.parse(date)))).toBe(true);
  });

  test('POST /api/stories is 404 until Phase 3', async ({ request }) => {
    const response = await request.post('/api/stories', { ...NO_REDIRECTS, data: { text: 'hello' } });
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    expectSecurityHeaders(response);
  });

  test('any other /api path is 404', async ({ request }) => {
    const response = await request.get('/api/whatever', NO_REDIRECTS);
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });
});

// `astro dev` sends no CSP, so only here does a browser render the production build under the Worker's policy
// (docs/adr/0010-csp-hashes-for-islands.md).
test.describe('pages under the production CSP', () => {
  for (const path of ['/pt/', '/en/about', '/de/decades/1980s', '/it/privacy', '/es/does-not-exist']) {
    test(`${path} renders with tokens applied and no CSP violation`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(path);
      const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-bg'));
      expect(bg.trim(), 'tokens.css loaded').not.toBe('');
      expect(errors).toEqual([]);
    });
  }

  // /e2e/islands exists only in builds with PLCMUSEUM_E2E_FIXTURES=1 (tests/e2e/fixtures/islands.astro): one React
  // island per client directive, each setting data-hydrated="true" once React has run in the browser.
  test('islands hydrate with every client directive and no CSP violation', async ({ page }) => {
    const errors = collectErrors(page);
    const response = await page.goto('/e2e/islands');
    expect(response?.status(), 'the fixture page exists: build with PLCMUSEUM_E2E_FIXTURES=1').toBe(200);
    // The page's meta policy and the header policy both apply, so the header must allow every hash the meta allows.
    const header = (await response?.allHeaders())?.['content-security-policy'] ?? '';
    expect(header, 'Content-Security-Policy').toBe(expectedPolicy);
    const meta = (await page.locator('meta[http-equiv="content-security-policy"]').getAttribute('content')) ?? '';
    for (const directive of ['script-src', 'style-src']) {
      expect(hashesIn(meta, directive), `${directive} in the meta element`).not.toHaveLength(0);
      expect(hashesIn(header, directive), directive).toEqual(expect.arrayContaining(hashesIn(meta, directive)));
    }
    for (const directive of ['load', 'idle', 'visible']) {
      const probe = page.locator(`[data-probe="${directive}"]`);
      await expect(probe, `client:${directive}`).toHaveAttribute('data-hydrated', 'true');
    }
    expect(errors).toEqual([]);
  });

  // /e2e/coverflow exists only in builds with PLCMUSEUM_E2E_FIXTURES=1 (tests/e2e/fixtures/coverflow.astro): the real
  // CoverFlow island over the fixture StageList in the page layout, as the home renders it once an exhibit is
  // published. Fixture ids are spelled out: src/fixtures/exhibits.ts imports a ?url asset that Playwright cannot load.
  test('the CoverFlow stage enhances, and the Era UI follows it, with no CSP violation', async ({ page }) => {
    const initialId = 'fx-octal-rack-or5';
    const lastId = 'fx-edge-pac-ep21';
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript((eventName) => {
      const seen: Window['coverFlowEdge'] = { centers: [], violations: [] };
      window.coverFlowEdge = seen;
      document.addEventListener(eventName, (event) => {
        seen.centers.push((event as CustomEvent<CenterChangeDetail>).detail.id);
      });
      document.addEventListener('securitypolicyviolation', (event) => {
        seen.violations.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    }, CENTER_CHANGE_EVENT);
    const response = await page.goto('/e2e/coverflow');
    expect(response?.status(), 'the fixture page exists: build with PLCMUSEUM_E2E_FIXTURES=1').toBe(200);
    expect((await response?.allHeaders())?.['content-security-policy'], 'Content-Security-Policy').toBe(expectedPolicy);

    // A positive signal that the island ran: its initial event, then the enhanced list.
    await expect.poll(() => page.evaluate(() => window.coverFlowEdge.centers)).toEqual([initialId]);
    const stage = page.locator('#stage');
    await expect(stage).toHaveAttribute('role', 'listbox');
    await expect(stage).toHaveAttribute('aria-activedescendant', `stage-link-${initialId}`);
    await expect(stage).toHaveAttribute('data-center-id', initialId);
    // The geometry arrives through CSSOM writes, which the policy allows (style attributes in markup it would drop).
    const center = page.locator(`#stage-item-${initialId}`);
    expect(await center.evaluate((item) => item.style.getPropertyValue('--coverflow-offset'))).toBe('0');
    await expect(center).toHaveCSS('visibility', 'visible');
    await expect(center).toHaveCSS('opacity', '1');

    // CENTER_CHANGE_EVENT reaches the EraToggle script under the same policy.
    const toggle = page.getByRole('switch', { name: en['era.toggle'], exact: true });
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-era', '1980s');
    await stage.focus();
    await page.keyboard.press('End');
    await expect(stage).toHaveAttribute('aria-activedescendant', `stage-link-${lastId}`);
    await expect(page.locator('html')).toHaveAttribute('data-era', '2020s');
    await expect(stage).toHaveAttribute('data-center-id', lastId);

    expect(await page.evaluate(() => window.coverFlowEdge.violations)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('404 pages', () => {
  test('a missing page under /pt/ is the Portuguese 404 page', async ({ request }) => {
    const response = await request.get('/pt/does-not-exist', NO_REDIRECTS);
    expect(response.status()).toBe(404);
    expect(await response.text()).toMatch(/<html[^>]*\blang="pt-BR"/);
  });

  test('a missing page outside the languages is 404', async ({ request }) => {
    const response = await request.get('/does-not-exist', NO_REDIRECTS);
    expect(response.status()).toBe(404);
    expectSecurityHeaders(response);
  });
});
