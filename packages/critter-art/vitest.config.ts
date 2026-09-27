import { defineConfig } from 'vitest/config';

// Unit tests only: golden (Chromium/Node canvas) comparisons run via the separate `golden` script
// so `pnpm --filter @cp/critter-art test` stays fast, deterministic and Chromium-free.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
