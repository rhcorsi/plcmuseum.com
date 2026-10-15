import { expect, test, type APIRequestContext } from '@playwright/test';
import en from '../../src/i18n/en.json' with { type: 'json' };
import { ERA_HOOKS, ERA_TOGGLE_HOOKS, LANGUAGE_HOOKS, STORAGE_KEYS } from '../../src/islands/contracts';
import { trackErrors } from './helpers/header-controls';

const ERA_READY = `.${ERA_TOGGLE_HOOKS.root}[${ERA_TOGGLE_HOOKS.ready}]`;
const LANGUAGE_READY = `nav.${LANGUAGE_HOOKS.nav}[${LANGUAGE_HOOKS.ready}]`;
const DECADE_PAGE = '/en/decades/1980s';

test('header controls work through the production CSP, including persistence', async ({ page }) => {
  const errors = trackErrors(page);
  const response = await page.goto(DECADE_PAGE);
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.locator(ERA_READY)).toHaveCount(1);
  await expect(page.locator(LANGUAGE_READY)).toHaveCount(1);
  const control = page.getByRole('switch', { name: en['era.toggle'], exact: true });
  await expect(control).toHaveAttribute('aria-checked', 'false');
  await control.click();
  await expect(control).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute(ERA_HOOKS.page, '1980s');
  await expect(page.locator('html')).toHaveAttribute(ERA_HOOKS.applied, '1980s');
  await page.reload();
  await expect(page.locator(ERA_READY)).toHaveCount(1);
  await expect(page.locator(LANGUAGE_READY)).toHaveCount(1);
  await expect(control).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute(ERA_HOOKS.page, '1980s');
  await expect(page.locator('html')).toHaveAttribute(ERA_HOOKS.applied, '1980s');
  await control.click();
  await expect(control).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('html')).toHaveAttribute(ERA_HOOKS.applied, 'museum');
  expect(errors).toEqual([]);
});

test('built HTML uses external scripts and has no inline header styling or handlers', async ({ request }) => {
  const decade = await request.get(DECADE_PAGE, { maxRedirects: 0 });
  expect(decade.status()).toBe(200);
  const source = await decade.text();
  const header = source.match(/<header\b[^>]*class="[^"]*\bsite-header\b[^"]*"[^>]*>[\s\S]*?<\/header>/i)?.[0];
  expect(header, 'the production header exists before testing its attributes').toBeDefined();
  expect(header).toContain(ERA_TOGGLE_HOOKS.root);
  expect(header).toContain(LANGUAGE_HOOKS.nav);
  expect(header).not.toMatch(/\sstyle\s*=/i);
  expect(header).not.toMatch(/\son[a-z]+\s*=/i);
  const headerScripts = header?.match(/<script\b[^>]*>/gi) ?? [];
  expect(headerScripts.length).toBeGreaterThanOrEqual(2);
  for (const script of headerScripts) expect(script).toMatch(/\ssrc\s*=/i);

  const about = await request.get('/en/about', { maxRedirects: 0 });
  expect(about.status()).toBe(200);
  const aboutSource = await about.text();
  const scripts = aboutSource.match(/<script\b[^>]*>/gi) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(script).toMatch(/\ssrc\s*=/i);
  expect(scripts.some((script) => /\btype="module"/.test(script) && /\bsrc="\/_astro\//.test(script))).toBe(true);
});

test.describe('the remembered language at the Worker redirect', () => {
  test.use({ locale: 'en-US' });
  test('a plain language choice changes the next visit to the root', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForURL('**/en/');
    await expect(page.locator(LANGUAGE_READY)).toHaveCount(1);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEYS.lang)).toBeNull();
    await page.goto('/en/about');
    await expect(page.locator(LANGUAGE_READY)).toHaveCount(1);
    await page.locator(LANGUAGE_READY).getByRole('link', { name: en['lang.pt'], exact: true }).click();
    await page.waitForURL('**/pt/about');
    await expect(page.locator(LANGUAGE_READY)).toHaveCount(1);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEYS.lang)).toBe('pt');
    // /prefs.js stops the intermediate English document before its load event.
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForURL('**/pt/');
    await expect(page.locator(LANGUAGE_READY)).toHaveCount(1);
    expect(new URL(page.url()).pathname).toBe('/pt/');
    expect(errors).toEqual([]);
  });
});

type ModuleSize = { raw: number; gzip: number; imports: string[] };

async function fetchModuleGraph(request: APIRequestContext, roots: string[]): Promise<Map<string, ModuleSize>> {
  const modules = new Map<string, ModuleSize>();
  const origin = new URL(roots[0]!).origin;
  async function visit(url: string): Promise<void> {
    if (modules.has(url)) return;
    expect(new URL(url).origin, 'module stays on the page origin').toBe(origin);
    expect(new URL(url).pathname, 'bundled module path').toMatch(/^\/_astro\/.+\.js$/);
    const response = await request.get(url, { maxRedirects: 0 });
    expect(response.status(), url).toBe(200);
    expect(response.headers()['content-type'], url).toMatch(/javascript/);
    const source = await response.text();
    expect(source, `${url}: no dynamic import outside the measured graph`).not.toMatch(/\bimport\s*\(/);
    const imports = [...source.matchAll(/\b(?:import|export)\s*(?:[^;"']*?\bfrom\s*)?["']([^"']+)["']/g)].map(
      (match) => {
        const specifier = match[1]!;
        expect(specifier, `${url}: static browser import`).toMatch(/^(?:\.{1,2}\/|\/)/);
        return new URL(specifier, url).href;
      },
    );
    const compressed = new Blob([source]).stream().pipeThrough(new CompressionStream('gzip'));
    modules.set(url, {
      raw: new TextEncoder().encode(source).byteLength,
      gzip: (await new Response(compressed).arrayBuffer()).byteLength,
      imports,
    });
    for (const dependency of imports) await visit(dependency);
  }
  for (const root of roots) await visit(root);
  return modules;
}

function dependenciesOf(root: string, modules: Map<string, ModuleSize>): Set<string> {
  const included = new Set<string>();
  const add = (url: string) => {
    if (included.has(url)) return;
    included.add(url);
    for (const dependency of modules.get(url)!.imports) add(dependency);
  };
  add(root);
  return included;
}

test('header module graph fits the total and per-control gzip budgets', async ({ page, request }, testInfo) => {
  const response = await request.get('/en/about', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const source = await response.text();
  const entries = await page.evaluate(
    ({ source, eraRoot, languageNav }) => {
      const document = new DOMParser().parseFromString(source, 'text/html');
      const entryAfter = (selector: string) => {
        const sibling = document.querySelector(selector)?.nextElementSibling;
        return sibling?.matches('script[type="module"][src]') ? sibling.getAttribute('src') : null;
      };
      return {
        roots: [
          ...Array.from(document.querySelectorAll('script[type="module"][src]'), (script) =>
            script.getAttribute('src'),
          ),
          ...Array.from(document.querySelectorAll('link[rel="modulepreload"][href]'), (link) =>
            link.getAttribute('href'),
          ),
        ],
        era: entryAfter(`.${eraRoot}`),
        language: entryAfter(`nav.${languageNav}`),
      };
    },
    { source, eraRoot: ERA_TOGGLE_HOOKS.root, languageNav: LANGUAGE_HOOKS.nav },
  );
  expect(entries.era, 'EraToggle module follows its root').toMatch(/^\/_astro\//);
  expect(entries.language, 'LanguageSwitch module follows its nav').toMatch(/^\/_astro\//);
  expect(entries.roots.length).toBeGreaterThanOrEqual(2);
  const absolute = (path: string) => new URL(path, response.url()).href;
  const modules = await fetchModuleGraph(
    request,
    entries.roots.map((path) => absolute(path!)),
  );
  const era = dependenciesOf(absolute(entries.era!), modules);
  const language = dependenciesOf(absolute(entries.language!), modules);
  const rows = [...modules].map(([url, size]) => ({
    file: new URL(url).pathname,
    entry:
      [era.has(url) ? 'EraToggle' : '', language.has(url) ? 'LanguageSwitch' : ''].filter(Boolean).join(', ') ||
      'modulepreload',
    raw: size.raw,
    gzip: size.gzip,
  }));
  const sum = (urls: Iterable<string>) => [...urls].reduce((bytes, url) => bytes + modules.get(url)!.gzip, 0);
  const totals = { total: sum(modules.keys()), EraToggle: sum(era), LanguageSwitch: sum(language) };
  console.table(rows);
  console.table(totals);
  const table = [
    '| File | Entry | Raw bytes | Gzip bytes |',
    '| --- | --- | ---: | ---: |',
    ...rows.map((row) => `| ${row.file} | ${row.entry} | ${row.raw} | ${row.gzip} |`),
    '',
    `Total: ${totals.total} / 3584 bytes. EraToggle: ${totals.EraToggle} / 2048. LanguageSwitch: ${totals.LanguageSwitch} / 1536.`,
  ].join('\n');
  await testInfo.attach('header-controls-js-budget', { body: table, contentType: 'text/markdown' });
  expect(totals.total).toBeGreaterThan(0);
  expect(totals.total).toBeLessThanOrEqual(3584);
  expect(totals.EraToggle).toBeLessThanOrEqual(2048);
  expect(totals.LanguageSwitch).toBeLessThanOrEqual(1536);
});
