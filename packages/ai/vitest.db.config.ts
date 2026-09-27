import { defineConfig } from 'vitest/config';

// Suites that write through a real Postgres (Testcontainers via @cp/db/testing).
export default defineConfig({
  test: {
    name: '@cp/ai:db',
    include: ['test/**/*.db.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    fileParallelism: false,
  },
});
