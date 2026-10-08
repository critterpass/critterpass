import { defineConfig } from 'vitest/config';

// Suites on a real Postgres and Redis (Testcontainers, Docker required). The global set-ups start
// one of each for the run and migrate a template database once; `startPostgres` and `startRedis`
// from @cp/db/testing then hand each file a clone of that template and a Redis server of its own.
const helpers = '../../packages/db/test/helpers';

export default defineConfig({
  test: {
    name: '@cp/worker:db',
    include: ['test/**/*.db.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    globalSetup: [
      `${helpers}/shared-postgres-global-setup.ts`,
      `${helpers}/shared-redis-global-setup.ts`,
    ],
    setupFiles: [`${helpers}/shared-server-worker-setup.ts`],
    // Stopping a test container terminates any connection a library still holds (Postgres 57P01,
    // "terminating connection due to administrator command"): teardown noise, not a test failure.
    onUnhandledError: (error) =>
      (error as { code?: unknown }).code === '57P01' ? false : undefined,
  },
});
