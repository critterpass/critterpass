import { defineConfig } from 'vitest/config';

// Suites that start Postgres with Testcontainers (Docker required). One file at a time: this
// machine runs several agents in parallel, and each file boots its own Postgres container.
export default defineConfig({
  test: {
    name: '@cp/spikes:db',
    include: ['src/**/*.db.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    fileParallelism: false,
    // Stopping a test container terminates any connection a library still holds (Postgres 57P01,
    // "terminating connection due to administrator command"): teardown noise, not a test failure.
    onUnhandledError: (error) =>
      (error as { code?: unknown }).code === '57P01' ? false : undefined,
  },
});
