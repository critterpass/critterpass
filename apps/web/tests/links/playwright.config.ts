/**
 * Link pages end to end: the production Worker bundle served by `wrangler dev`, talking to a
 * fixture-backed stand-in for the api's preview route (./fake-api.ts). Association-file tests pick
 * the host with a `Host` header; page tests run on localhost with `LINKS_ENV=production`.
 *
 *   pnpm --filter @cp/web test:e2e -- links
 */
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

export const WEB_PORT = 4399;
export const API_PORT = 4398;
export const TEST_FINGERPRINT =
  'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';

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
].join(' ');

export default defineConfig({
  testDir: '.',
  testMatch: '*.e2e.ts',
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}` },
  webServer: [
    {
      command: `exec pnpm exec tsx tests/links/fake-api.ts ${API_PORT}`,
      cwd: webRoot,
      port: API_PORT,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGINT', timeout: 5_000 },
    },
    {
      command: `pnpm exec astro build && exec pnpm exec ${serve}`,
      cwd: webRoot,
      url: `http://127.0.0.1:${WEB_PORT}/`,
      timeout: 240_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGINT', timeout: 5_000 },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
