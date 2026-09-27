import { defineConfig } from 'vitest/config';

// Unit suite: no containers, no network. Database-backed suites (*.db.test.ts) run through vitest.db.config.ts.
export default defineConfig({
  test: {
    name: '@cp/spikes',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.db.test.ts'],
  },
});
