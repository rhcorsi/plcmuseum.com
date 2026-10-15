// What only the Worker does, checked against `wrangler dev` over the production build (playwright.config.ts, project
// "edge"): the "/" redirect, the security headers, /api, the 404 pages and island hydration under the CSP. Requests
// never follow redirects, so the Worker's own answer is what gets checked.
import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { SECURITY_HEADERS } from '../../worker/src/security-headers';

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

function withoutHashSources(policy: string): string {
  return policy
    .split('; ')
    .map((directive) =>
      directive
        .split(' ')
        .filter((source) => !HASH_SOURCE.test(source))
        .join(' '),
    )
    .join('; ');
}

// The CSP is the documented policy plus the island hashes of csp.json, which only ever add sources (ADR-0010).
function expectSecurityHeaders(response: APIResponse): void {
  const headers = response.headers();
  const { 'Content-Security-Policy': policy, ...others } = SECURITY_HEADERS;
  for (const [name, value] of Object.entries(others)) expect(headers[name.toLowerCase()], name).toBe(value);
  expect(withoutHashSources(headers['content-security-policy'] ?? ''), 'Content-Security-Policy').toBe(policy);
}

/** Console errors and uncaught exceptions; Chrome reports every refused inline script or style as a console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    // A deliberate 404 shows up as a failed resource load, which is not a policy problem.
    if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('language redirect on /', () => {
  for (const [acceptLanguage, location] of [
    ['pt-BR,pt;q=0.9,en;q=0.8', '/pt/'],
    ['de-DE', '/de/'],
    ['fr-FR,es;q=0.5', '/es/'],
    ['it-CH', '/it/'],
    ['en;q=0,pt;q=0.1', '/pt/'],
    ['fr-FR', '/en/'],
    ['*', '/en/'],
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

  test('the CSP adds exactly the hashes of /csp.json', async ({ request }) => {
    const manifest = (await (await request.get('/csp.json', NO_REDIRECTS)).json()) as Record<string, string[]>;
    const policy = (await request.get('/en/', NO_REDIRECTS)).headers()['content-security-policy'] ?? '';
    expect(manifest['script-src'], 'the build hashes the island runtime').not.toHaveLength(0);
    for (const directive of ['script-src', 'style-src'])
      expect(hashesIn(policy, directive)).toEqual(manifest[directive]);
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
