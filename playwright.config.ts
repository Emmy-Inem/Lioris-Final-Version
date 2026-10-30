import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke tests run against the exported web build (dist/), served by
// e2e/serve-dist.mjs with the exact response headers from vercel.json (including the CSP).
//
//   npm run build     # produce dist/ (not part of the e2e scripts)
//   npm run e2e
//
// The suite is hermetic: Cloudflare Turnstile and Supabase network calls are stubbed in
// e2e/fixtures.ts, so no external service is contacted.

const PORT = Number(process.env.E2E_PORT || 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: isCI
    ? [['list'], ['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The app follows prefers-color-scheme, and its colour tokens differ per theme, so the axe
    // (colour-contrast) checks run a second time in the dark theme. Only the accessibility spec is
    // repeated; the rest of the suite is theme-agnostic.
    {
      name: 'chromium-dark',
      testMatch: /a11y\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
  ],
  webServer: {
    command: 'node e2e/serve-dist.mjs',
    url: BASE_URL,
    env: { PORT: String(PORT) },
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
});
