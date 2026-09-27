import { defineConfig } from 'vitest/config';

// Every suite here exercises a real Postgres via Testcontainers (test/helpers/pg-container.ts
// starts one container per test file and clones a migrated template database per test), so files
// run one at a time to keep host resource use predictable alongside other services' suites.
export default defineConfig({
  test: {
    name: '@cp/db',
    testTimeout: 60_000,
    hookTimeout: 240_000,
    fileParallelism: false,
    // Stopping a test container terminates any connection a library still holds (Postgres 57P01,
    // "terminating connection due to administrator command"): teardown noise, not a test failure.
    onUnhandledError: (error) =>
      (error as { code?: unknown }).code === '57P01' ? false : undefined,
  },
});
