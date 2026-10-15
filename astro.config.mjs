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

/**
 * Build housekeeping:
 * - writes build.json, which the Worker reads to answer GET /api/health (no secrets, no DB);
 * - removes the fixture pages under /dev, which exist for component work only (docs/DESIGN_SYSTEM.md section 7),
 *   and every asset no remaining page reaches.
 * @returns {import('astro').AstroIntegration}
 */
function siteBuild() {
  return {
    name: 'plcmuseum:build',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const info = { build: gitSha(), date: new Date().toISOString() };
        await writeFile(new URL('build.json', dir), `${JSON.stringify(info)}\n`);
        await rm(new URL('dev/', dir), { recursive: true, force: true });
        const pruned = await pruneUnreachableAssets(dir);
        logger.info(
          `build.json written (${info.build.slice(0, 12)}); /dev removed; ${pruned.length} unreachable assets pruned`,
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
    // The CSP is `style-src 'self'`: inlined <style> blocks would be refused by the browser.
    inlineStylesheets: 'never',
  },
  integrations: [react(), siteBuild()],
  // The dev toolbar injects shadow-DOM UI into every dev page, which leaks into fixture screenshots and e2e
  // locators (docs/DESIGN_SYSTEM.md section 7 screenshots are taken from `astro dev`).
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
    // No data: URIs for fonts or scripts (CSP font-src and script-src are 'self' only).
    build: { assetsInlineLimit: 0 },
  },
});
