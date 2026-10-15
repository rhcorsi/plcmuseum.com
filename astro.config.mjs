// @ts-check
import { execFileSync } from 'node:child_process';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

const SITE = 'https://plcmuseum.com';

function gitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

const TEXT_FILE = /\.(html|css|js|mjs|json|xml|txt|svg|webmanifest)$/i;

/**
 * Deletes files under _astro/ that nothing published reaches. Vite emits every asset a module imports, including
 * the fixture media of the removed /dev pages and the illustrations of exhibits this stage does not build (drafts),
 * and none of those may ship. Reachability starts from every file outside _astro/ and follows asset names
 * (content-hashed, so unique) through HTML, CSS and JS.
 * @param {URL} dir
 * @returns {Promise<string[]>} the pruned files, relative to dir
 */
async function pruneUnreachableAssets(dir) {
  const root = fileURLToPath(dir);
  const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
  const assetDir = path.join(root, '_astro') + path.sep;
  const unreached = new Set(files.filter((file) => file.startsWith(assetDir)));
  const queue = files.filter((file) => !unreached.has(file) && TEXT_FILE.test(file));
  while (queue.length > 0) {
    const text = await readFile(/** @type {string} */ (queue.pop()), 'utf8');
    for (const asset of unreached) {
      if (!text.includes(path.basename(asset))) continue;
      unreached.delete(asset);
      if (TEXT_FILE.test(asset)) queue.push(asset);
    }
  }
  await Promise.all([...unreached].map((file) => rm(file)));
  return [...unreached].map((file) => path.relative(root, file));
}

// The <meta http-equiv="content-security-policy"> that security.csp writes into each page, in any attribute order.
const CSP_META = /<meta\b(?=[^>]*\bhttp-equiv="content-security-policy")[^>]*\bcontent="([^"]*)"/gi;
const HASH_SOURCE = /^'(sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2})'$/;

/**
 * The union, per directive, of the hashes Astro put in the CSP meta element of every page: the inline scripts and
 * styles it emits for islands. The Worker adds them to its header policy (docs/adr/0010-csp-hashes-for-islands.md).
 * Every CSP meta element in a <head> counts, so pages never carry a hand-written one (docs/SECURITY.md 3.1).
 * @param {URL} dir
 * @returns {Promise<Record<'script-src' | 'style-src', string[]>>}
 */
async function collectCspHashes(dir) {
  const root = fileURLToPath(dir);
  /** @type {Set<string>} */
  const scripts = new Set();
  /** @type {Set<string>} */
  const styles = new Set();
  const byDirective = new Map([
    ['script-src', scripts],
    ['style-src', styles],
  ]);
  const pages = (await readdir(root, { recursive: true })).filter((file) => file.endsWith('.html'));
  for (const page of pages) {
    const html = await readFile(path.join(root, page), 'utf8');
    // Astro writes its element into <head>; a meta element further down could only come from injected markup.
    const headEnd = html.search(/<\/head>/i);
    for (const [, policy = ''] of html.slice(0, Math.max(headEnd, 0)).matchAll(CSP_META)) {
      for (const directive of policy.split(';')) {
        const [name = '', ...sources] = directive.trim().split(/\s+/);
        const found = byDirective.get(name);
        if (!found) continue;
        for (const source of sources) {
          const hash = HASH_SOURCE.exec(source)?.[1];
          if (hash) found.add(hash);
        }
      }
    }
  }
  return { 'script-src': [...scripts].sort(), 'style-src': [...styles].sort() };
}

/**
 * Build housekeeping:
 * - writes build.json, which the Worker reads to answer GET /api/health (no secrets, no DB);
 * - removes the fixture pages under /dev, which exist for component work only (docs/DESIGN_SYSTEM.md section 7),
 *   and every asset no remaining page reaches;
 * - writes csp.json, the island hashes the Worker adds to its Content-Security-Policy header;
 * - with PLCMUSEUM_E2E_FIXTURES=1 (the e2e job only), adds one test page per tests/e2e/fixtures/*.astro under /e2e/.
 * @returns {import('astro').AstroIntegration}
 */
function siteBuild() {
  return {
    name: 'plcmuseum:build',
    hooks: {
      'astro:config:setup': async ({ injectRoute, logger }) => {
        if (process.env.PLCMUSEUM_E2E_FIXTURES !== '1') return;
        // One test page per .astro file in tests/e2e/fixtures/, so an island task adds its page without editing config.
        // Helper components in that folder are .tsx or .ts (HydrationProbe.tsx), never .astro.
        const names = (await readdir(new URL('./tests/e2e/fixtures/', import.meta.url)))
          .filter((file) => file.endsWith('.astro'))
          .map((file) => file.slice(0, -'.astro'.length));
        for (const name of names) {
          injectRoute({ pattern: `/e2e/${name}`, entrypoint: `./tests/e2e/fixtures/${name}.astro` });
        }
        logger.warn(
          `PLCMUSEUM_E2E_FIXTURES=1: test pages ${names.map((name) => `/e2e/${name}`).join(', ')} are included; never deploy this build`,
        );
      },
      'astro:build:done': async ({ dir, logger }) => {
        const info = { build: gitSha(), date: new Date().toISOString() };
        await writeFile(new URL('build.json', dir), `${JSON.stringify(info)}\n`);
        await rm(new URL('dev/', dir), { recursive: true, force: true });
        const pruned = await pruneUnreachableAssets(dir);
        // Once /dev and the unreachable assets are gone: only published pages contribute, and the pruner never sees it.
        const csp = await collectCspHashes(dir);
        await writeFile(new URL('csp.json', dir), `${JSON.stringify(csp)}\n`);
        logger.info(
          `build.json written (${info.build.slice(0, 12)}); /dev removed; ${pruned.length} unreachable assets pruned; ` +
            `csp.json written (${csp['script-src'].length} script and ${csp['style-src'].length} style hashes)`,
        );
        for (const file of pruned) logger.debug(`pruned ${file}`);
      },
    },
  };
}

export default defineConfig({
  site: SITE,
  output: 'static',
  // `preserve` maps src/pages/[lang]/404.astro to dist/<lang>/404.html, which the assets binding
  // serves as the nearest 404 page for that language (wrangler.jsonc not_found_handling).
  trailingSlash: 'ignore',
  build: {
    format: 'preserve',
    // Stylesheets stay files under the CSP's `style-src 'self'`; the only inline styles allowed are the hashed ones
    // Astro emits for islands (docs/adr/0010-csp-hashes-for-islands.md).
    inlineStylesheets: 'never',
  },
  integrations: [react(), siteBuild()],
  // Hashes every inline script and style Astro emits (the island runtime and client:* loaders) into a CSP meta
  // element per page; siteBuild copies them into csp.json for the Worker's header (ADR-0010). Build only: `astro dev`
  // sends no CSP. Adding scriptDirective or styleDirective `resources` replaces the default 'self': list "'self'" too.
  security: { csp: true },
  // The dev toolbar injects shadow-DOM UI into every dev page, which leaks into fixture screenshots and e2e
  // locators (docs/DESIGN_SYSTEM.md section 7 screenshots are taken from `astro dev`).
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
    // No data: URIs for fonts or scripts (CSP font-src and script-src are 'self' only).
    build: { assetsInlineLimit: 0 },
  },
});
