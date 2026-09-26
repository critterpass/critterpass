import { defineConfig } from 'vitest/config';

// Unit suite: no containers. Database-backed suites (*.db.test.ts) run through vitest.db.config.ts.
export default defineConfig({
  test: {
    name: '@cp/api',
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.db.test.ts'],
  },
});
