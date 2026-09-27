import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Shared, memory-constrained CI/dev machine: keep this package's test run to one worker.
    maxWorkers: 1,
  },
});
