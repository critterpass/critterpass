/**
 * The web app end to end: the production Worker bundle served by `wrangler dev`, talking to a
 * fixture-backed stand-in for the api (./fake-api.ts). Runs the link-page suite (../links) and the
 * site suite (this folder) against one build. A second Worker serves a coming-soon build the way
 * production does until launch (`SITE_MODE=coming-soon`), with its own local waitlist database.
 *
 *   pnpm --filter @cp/web test:e2e              # everything
 *   pnpm --filter @cp/web test:e2e -- site/home # one spec
 */
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

export const WEB_PORT = 4399;
export const API_PORT = 4398;
export const COMING_SOON_PORT = 4397;
/** The same build answering as the staging host (its test app is on no store). */
export const STAGING_PORT = 4396;
export const STAGING_URL = `http://127.0.0.1:${STAGING_PORT}`;
/** The front door as production serves it until launch: the coming-soon page and its waitlist. */
export const COMING_SOON_URL = `http://127.0.0.1:${COMING_SOON_PORT}`;
export const TEST_FINGERPRINT =
  'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
/** Local signing key for the OG cache keys (never a real secret). */
export const TEST_OG_SECRET = 'site-e2e-og-cache-key';

const webRoot = fileURLToPath(new URL('../..', import.meta.url));
const skipBuild = process.env['SITE_E2E_SKIP_BUILD'] === '1';
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
// A second Worker from the same build, as a host other than production with no TestFlight link.
const serveStaging = [
  'exec pnpm exec wrangler dev -c dist/server/wrangler.json',
  `--port ${STAGING_PORT} --ip 127.0.0.1 --inspector-port 0`,
  '--persist-to .wrangler/staging-e2e/state',
  '--var LINKS_ENV:staging',
  `--var LINKS_API_BASE_URL:http://127.0.0.1:${API_PORT}`,
].join(' ');
// The coming-soon Worker runs its own build (a coming-soon build leaves the rest of the site out),
// with its own state folder and inspector port, so the two Workers never share a local database
// file.
const comingSoonBuild = '.wrangler/coming-soon-e2e/site';
const comingSoonConfig = `-c ${comingSoonBuild}/server/wrangler.json`;
const comingSoonState = '--persist-to .wrangler/coming-soon-e2e/state';
const serveComingSoon = [
  ...(skipBuild ? [] : [`SITE_MODE=coming-soon pnpm exec astro build --outDir ${comingSoonBuild}`]),
  `pnpm exec wrangler d1 migrations apply DB --local ${comingSoonConfig} ${comingSoonState}`,
  [
    `exec pnpm exec wrangler dev ${comingSoonConfig}`,
    `--port ${COMING_SOON_PORT} --ip 127.0.0.1 --inspector-port 0`,
    '--var SITE_MODE:coming-soon',
    comingSoonState,
  ].join(' '),
].join(' && ');

export default defineConfig({
  testDir: '..',
  testMatch: ['links/*.e2e.ts', 'site/*.e2e.ts', 'driver-plan/*.e2e.ts'],
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
      command: `${skipBuild ? '' : 'pnpm exec astro build && '}exec pnpm exec ${serve}`,
      cwd: webRoot,
      url: `http://127.0.0.1:${WEB_PORT}/`,
      timeout: 240_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGINT', timeout: 5_000 },
    },
    // Started once the server above is up: it serves that server's build.
    {
      command: serveStaging,
      cwd: webRoot,
      url: `${STAGING_URL}/`,
      timeout: 120_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGINT', timeout: 5_000 },
    },
    // Started once the servers above are up, so the two builds never run at the same time.
    {
      command: serveComingSoon,
      cwd: webRoot,
      url: `${COMING_SOON_URL}/`,
      timeout: 300_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGINT', timeout: 5_000 },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
