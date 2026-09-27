import { defineConfig } from 'vitest/config';

// Unit tests only; the Playwright suite under playwright/ runs through `playwright test`.
export default defineConfig({
  test: {
    name: '@cp/admin',
    include: ['src/**/*.test.{ts,tsx}', 'worker/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
