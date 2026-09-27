/**
 * Ops console end-to-end suite (apps/admin/playwright):
 * `pnpm --filter @cp/admin exec playwright test [file]`.
 *
 * Starts its own Postgres (the Testcontainers image, postgis included) on a private port, seeds it
 * with `seed:local`, then runs the api and the Vite dev server against it, so the suite never
 * touches the shared local database. Needs `pnpm infra:up` for Redis and a built
 * `critterpass-postgres:test` image (any `@cp/db` test run builds it).
 */
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

import { E2E_API_PORT, E2E_DATABASE_URL, E2E_WEB_PORT } from './playwright/e2e-env';

const e2eDir = path.join(import.meta.dirname, 'playwright');
const repoRoot = path.resolve(import.meta.dirname, '../..');
const webOrigin = `http://127.0.0.1:${E2E_WEB_PORT}`;

export default defineConfig({
  testDir: e2eDir,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: path.join(e2eDir, 'global-setup.ts'),
  globalTeardown: path.join(e2eDir, 'global-teardown.ts'),
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
  },
  // SwiftShader gives headless Chromium the WebGL2 MapLibre needs for the POI pin preview.
  projects: [
    {
      name: 'desktop',
      testIgnore: /audit\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
    // Last, after every other spec: the audit viewer must show every action the run performed.
    {
      name: 'audit',
      testMatch: /audit\.spec\.ts/,
      dependencies: ['desktop'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      // Binaries directly (not through pnpm), so Playwright's shutdown reaches the server itself.
      command: `${path.join(repoRoot, 'node_modules/.bin/tsx')} src/index.ts`,
      cwd: path.join(repoRoot, 'services/api'),
      url: `http://127.0.0.1:${E2E_API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      env: {
        APP_ENV: 'local',
        NODE_ENV: 'development',
        PORT: String(E2E_API_PORT),
        LOG_LEVEL: 'warn',
        DATABASE_URL: E2E_DATABASE_URL,
        AUTH_DATABASE_URL: E2E_DATABASE_URL,
        REDIS_URL: 'redis://localhost:63790',
        PUBLIC_BASE_URL: `http://localhost:${E2E_API_PORT}`,
        // Local-only values, the same ones the committed .env.example carries.
        BETTER_AUTH_SECRET: 'local-development-only-auth-secret-not-for-staging',
        ADMIN_PUBLIC_ORIGIN: webOrigin,
        ADMIN_ALLOWLIST:
          'owner@critterpass.test:owner,ops@critterpass.test:ops,content@critterpass.test:content,support@critterpass.test:support',
        ADMIN_DEV_SIGN_IN: 'true',
      },
    },
    {
      command: 'node_modules/.bin/vite',
      cwd: import.meta.dirname,
      url: webOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      env: {
        ADMIN_API_ORIGIN: `http://127.0.0.1:${E2E_API_PORT}`,
        ADMIN_DEV_PORT: String(E2E_WEB_PORT),
        ADMIN_DEV_HOST: '127.0.0.1',
        VITE_ADMIN_DEV_SIGN_IN: 'true',
      },
    },
  ],
});
