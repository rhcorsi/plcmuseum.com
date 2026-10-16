// Two servers, two kinds of tests:
// - "pages": `astro dev` (drafts and /dev fixture pages included) for page structure, components and fixtures;
// - "edge": `wrangler dev` over the production build in dist/ for what only the Worker does (redirect, headers,
//   /api, 404 pages, islands under the CSP). Build first with the e2e test pages under /e2e/ added (one per tests/e2e/fixtures/*.astro), as CI does:
//   PLCMUSEUM_E2E_FIXTURES=1 pnpm build
import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);
const PAGES_URL = 'http://localhost:4321';
const EDGE_URL = 'http://localhost:8787';
const EDGE_HTTPS_URL = 'https://localhost:8788';

// /prefs.js leans on what each engine does before first paint (Navigation Timing, window.stop(), render blocking, the
// HTTP cache), so its edge spec also runs in Firefox and WebKit, on demand and before a production deploy (ADR-0012).
// CI installs Chromium only. Once: `pnpm exec playwright install firefox webkit`; then, over the same build:
//   PLCMUSEUM_E2E_ALL_BROWSERS=1 pnpm exec playwright test --project=edge-firefox --project=edge-webkit
// They use a second `wrangler dev` over HTTPS (its own self-signed certificate), as production is: WebKit applies the
// CSP's upgrade-insecure-requests to http://localhost too, so over HTTP every stylesheet and script would go unanswered.
// ignoreHTTPSErrors is there for that local certificate only: a test against a real host never sets it.
const ALL_BROWSERS = process.env.PLCMUSEUM_E2E_ALL_BROWSERS === '1';
const otherBrowsers = [
  { name: 'edge-firefox', device: devices['Desktop Firefox'] },
  { name: 'edge-webkit', device: devices['Desktop Safari'] },
].map(({ name, device }) => ({
  name,
  testMatch: /prefs\.edge\.spec\.ts$/,
  use: { ...device, baseURL: EDGE_HTTPS_URL, ignoreHTTPSErrors: true },
}));
const httpsEdgeServer = {
  command: 'pnpm exec wrangler dev --port 8788 --ip 127.0.0.1 --local-protocol https',
  url: `${EDGE_HTTPS_URL}/api/health`,
  ignoreHTTPSErrors: true,
  reuseExistingServer: !CI,
  timeout: 120_000,
  env: { WRANGLER_SEND_METRICS: 'false' },
};

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
    ...(ALL_BROWSERS ? otherBrowsers : []),
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
    ...(ALL_BROWSERS ? [httpsEdgeServer] : []),
  ],
});
