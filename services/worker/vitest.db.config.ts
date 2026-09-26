import { defineConfig } from 'vitest/config';

// Suites that start Postgres/Redis with Testcontainers (Docker required).
export default defineConfig({
  test: {
    name: '@cp/worker:db',
    include: ['test/**/*.db.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 240_000,
  },
});
