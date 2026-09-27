import { defineConfig } from 'vitest/config';

// Recorded supplier fixtures at the network boundary; no containers (the audit table's database
// test lives with the worker, which owns the system-role connection).
export default defineConfig({
  test: {
    name: '@cp/suppliers',
    include: ['test/**/*.test.ts'],
  },
});
