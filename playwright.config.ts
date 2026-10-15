// Two servers, two kinds of tests:
// - "pages": `astro dev` (drafts and /dev fixture pages included) for page structure, components and fixtures;
// - "edge": `wrangler dev` over the production build in dist/ for what only the Worker does (redirect, headers,
//   /api, 404 pages). Run `pnpm build` first; CI does.
import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);
const PAGES_URL = 'http://localhost:4321';
const EDGE_URL = 'http://localhost:8787';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'pages',
      testIgnore: /edge\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: PAGES_URL },
    },
    {
      name: 'edge',
      testMatch: /edge\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: EDGE_URL },
    },
  ],
  webServer: [
    {
      command: 'pnpm exec astro dev --port 4321',
      url: `${PAGES_URL}/en/`,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm exec wrangler dev --port 8787 --ip 127.0.0.1',
      url: `${EDGE_URL}/api/health`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: { WRANGLER_SEND_METRICS: 'false' },
    },
  ],
});
