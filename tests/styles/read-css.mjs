// Vitest replaces every .css import with an empty module, ?raw included, unless vitest.config.ts opts the file into
// CSS processing (test.css.include). The style tests therefore read their CSS from disk here. Plain JS on purpose:
// the type-checked tests cannot import node: modules (the project has no @types/node).
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);

/**
 * Every .css file under a repository directory, keyed like import.meta.glob ("/src/styles/tokens.css").
 * @param {string} dir repository-relative directory without slashes at either end, e.g. "src/styles"
 * @returns {Record<string, string>}
 */
export function readCssFiles(dir) {
  const base = new URL(`${dir}/`, ROOT);
  const files = readdirSync(base, { recursive: true, encoding: 'utf8' })
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file.endsWith('.css'))
    .sort();
  return Object.fromEntries(files.map((file) => [`/${dir}/${file}`, readFileSync(new URL(file, base), 'utf8')]));
}
