/**
 * The link-preview check and the security-header check, against a deployed site (no local
 * server, no browser):
 *
 *   UNFURL_BASE_URL=https://staging.critterpass.app \
 *     pnpm --filter @cp/web exec playwright test -c tests/site/unfurl.config.ts
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['unfurl.e2e.ts', 'deployed-headers.check.ts'],
  reporter: 'list',
  timeout: 30_000,
  retries: 1,
});
