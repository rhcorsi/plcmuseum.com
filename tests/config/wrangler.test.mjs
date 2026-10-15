// wrangler.jsonc invariants that keep the preview private: the Workers answer only on their custom domains, so a
// workers.dev or per-version preview URL can never serve the site around Cloudflare Access (docs/SECURITY.md 3.5).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { REPO } from '../scripts/helpers.mjs';

// The file uses whole-line // comments only, so dropping those lines leaves plain JSON.
const config = JSON.parse(
  readFileSync(path.join(REPO, 'wrangler.jsonc'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n'),
);

describe('wrangler.jsonc', () => {
  test('turns workers.dev and preview URLs off at the top level', () => {
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
  });

  test.each(Object.keys(config.env ?? {}))('env.%s never turns them back on and keeps a custom domain', (name) => {
    const env = config.env[name];
    expect(env.workers_dev ?? false).toBe(false);
    expect(env.preview_urls ?? false).toBe(false);
    expect(env.routes?.length).toBeGreaterThan(0);
    for (const route of env.routes) expect(route.custom_domain).toBe(true);
  });
});
