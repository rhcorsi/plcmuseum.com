// @ts-check
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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

const PREFS_SCRIPT = '<script src="/prefs.js"></script>';

/**
 * Serves /prefs.js (ADR-0012) under a content-hashed name in _astro/, which the Worker lets browsers cache for a year,
 * and moves it from where Base.astro writes it to the end of <head>, after the CSP meta element and the stylesheets
 * Astro injects there. Chromium's preload scanner holds back every request that follows a CSP meta until the parser
 * has read that meta, so a parser-blocking script in front of it delayed the stylesheets by one round trip on every
 * page view. At the end it still blocks rendering, and it runs once the stylesheets have arrived.
 * The file is public/prefs.js byte for byte, and dist/prefs.js goes, so the hashed name is the only one served.
 * Every built page has the script once (Base.astro); a page without it is a layout regression and fails the build.
 * @param {URL} dir
 * @returns {Promise<{ src: string, pages: number }>} the script's URL and the pages rewritten
 */
async function placePrefsScript(dir) {
  const root = fileURLToPath(dir);
  const source = await readFile(path.join(root, 'prefs.js'));
  const name = `prefs.${createHash('sha256').update(source).digest('base64url').slice(0, 8)}.js`;
  await mkdir(path.join(root, '_astro'), { recursive: true });
  await writeFile(path.join(root, '_astro', name), source);
  await rm(path.join(root, 'prefs.js'));
  const src = `/_astro/${name}`;
  const script = `<script src="${src}"></script>`;
  const pages = (await readdir(root, { recursive: true })).filter((file) => file.endsWith('.html'));
  for (const page of pages) {
    const file = path.join(root, page);
    const html = await readFile(file, 'utf8');
    const headEnd = html.search(/<\/head>/i);
    const at = html.indexOf(PREFS_SCRIPT);
    if (at < 0 || at > headEnd || html.indexOf(PREFS_SCRIPT, at + 1) >= 0)
      throw new Error(`${page}: expected exactly one ${PREFS_SCRIPT} in <head> (src/layouts/Base.astro)`);
    const without = html.slice(0, at) + html.slice(at + PREFS_SCRIPT.length);
    const end = without.search(/<\/head>/i);
    await writeFile(file, without.slice(0, end) + script + without.slice(end));
  }
  return { src, pages: pages.length };
}

/**
 * Build housekeeping:
 * - writes build.json, which the Worker reads to answer GET /api/health (no secrets, no DB);
 * - removes the fixture pages under /dev, which exist for component work only (docs/DESIGN_SYSTEM.md section 7),
 *   and every asset no remaining page reaches;
 * - writes csp.json, the island hashes the Worker adds to its Content-Security-Policy header;
 * - serves /prefs.js under a content-hashed name in _astro/ and moves it to the end of <head>, after the CSP meta and
 *   the stylesheets (ADR-0012);
 * - refuses a public/_astro/ folder: the Worker caches /_astro/ for a year, which only content-hashed names survive;
 * - with PLCMUSEUM_E2E_FIXTURES=1 (the e2e job only), adds one test page per tests/e2e/fixtures/*.astro under /e2e/.
 * @returns {import('astro').AstroIntegration}
 */
function siteBuild() {
  return {
    name: 'plcmuseum:build',
    hooks: {
      'astro:config:setup': async ({ config, injectRoute, logger }) => {
        // public/ is copied as is, so its files keep their names from one deploy to the next: under /_astro/, which
        // browsers keep for a year without asking (worker/src/index.ts), a changed file would never reach them.
        if (existsSync(path.join(fileURLToPath(config.publicDir), '_astro')))
          throw new Error('public/_astro/ is not allowed: /_astro/ holds content-hashed build output only');
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
        const prefs = await placePrefsScript(dir);
        logger.info(
          `build.json written (${info.build.slice(0, 12)}); /dev removed; ${pruned.length} unreachable assets pruned; ` +
            `csp.json written (${csp['script-src'].length} script and ${csp['style-src'].length} style hashes); ` +
            `/prefs.js served as ${prefs.src} at the end of <head> on ${prefs.pages} pages`,
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
