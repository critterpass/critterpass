/**
 * The web app end to end: the production Worker bundle served by `wrangler dev`, talking to a
 * fixture-backed stand-in for the api (./fake-api.ts). Runs the link-page suite (../links) and the
 * site suite (this folder) against one build.
 *
 *   pnpm --filter @cp/web test:e2e              # everything
 *   pnpm --filter @cp/web test:e2e -- site/home # one spec
 */
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

export const WEB_PORT = 4399;
export const API_PORT = 4398;
export const TEST_FINGERPRINT =
  'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
/** Local signing key for the OG cache keys (never a real secret). */
export const TEST_OG_SECRET = 'site-e2e-og-cache-key';

const webRoot = fileURLToPath(new URL('../..', import.meta.url));
const fingerprints = JSON.stringify({
  'app.critterpass': [TEST_FINGERPRINT],
  'app.critterpass.staging': [TEST_FINGERPRINT],
});
const serve = [
  'wrangler dev -c dist/server/wrangler.json',
  `--port ${WEB_PORT} --ip 127.0.0.1`,
  '--var LINKS_ENV:production',
  `--var LINKS_API_BASE_URL:http://127.0.0.1:${API_PORT}`,
  `--var 'ANDROID_CERT_FINGERPRINTS:${fingerprints}'`,
  `--var OG_CACHE_SECRET:${TEST_OG_SECRET}`,
].join(' ');

export default defineConfig({
  testDir: '..',
  testMatch: ['links/*.e2e.ts', 'site/*.e2e.ts'],
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}` },
  webServer: [
    {
      command: `exec pnpm exec tsx tests/site/fake-api.ts ${API_PORT}`,
      cwd: webRoot,
      port: API_PORT,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGINT', timeout: 5_000 },
    },
    {
      command: `${process.env['SITE_E2E_SKIP_BUILD'] === '1' ? '' : 'pnpm exec astro build && '}exec pnpm exec ${serve}`,
      cwd: webRoot,
      url: `http://127.0.0.1:${WEB_PORT}/`,
      timeout: 240_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGINT', timeout: 5_000 },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
