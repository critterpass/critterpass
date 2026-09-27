import { defineConfig } from 'vitest/config';

// Suites that start Postgres/Redis with Testcontainers (Docker required).
export default defineConfig({
  test: {
    name: '@cp/worker:db',
    include: ['test/**/*.db.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    // Stopping a test container terminates any connection a library still holds (Postgres 57P01,
    // "terminating connection due to administrator command"): teardown noise, not a test failure.
    onUnhandledError: (error) =>
      (error as { code?: unknown }).code === '57P01' ? false : undefined,
  },
});
