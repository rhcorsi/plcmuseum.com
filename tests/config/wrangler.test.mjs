// wrangler.jsonc invariants that keep the preview private: the Workers answer only on their custom domains, so no
// workers.dev URL, per-version preview URL or custom-domain branch preview (<name>.preview.plcmuseum.com, which the
// Access application does not cover) can serve the site around Cloudflare Access (docs/SECURITY.md 3.5).
// The config is resolved by Wrangler itself, so inheritance into env.preview is checked, not assumed.
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { experimental_readRawConfig, unstable_readConfig } from 'wrangler';
import { REPO } from '../scripts/helpers.mjs';

const CONFIG = path.join(REPO, 'wrangler.jsonc');
const ENVS = [undefined, 'preview'];

describe.each(ENVS)('wrangler.jsonc resolved for env %s', (env) => {
  const config = unstable_readConfig({ config: CONFIG, env });

  test('workers.dev and preview URLs are off', () => {
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
  });

  test('every route is a custom domain without branch previews', () => {
    expect(config.routes?.length).toBeGreaterThan(0);
    for (const route of config.routes ?? []) {
      expect(route).toMatchObject({ custom_domain: true });
      expect(route.previews_enabled ?? false).toBe(false);
    }
  });
});

test('the environments checked above are all the environments in wrangler.jsonc', () => {
  const declared = Object.keys(experimental_readRawConfig({ config: CONFIG }).rawConfig.env ?? {}).sort();
  expect(declared).toEqual(ENVS.filter(Boolean).sort());
});
