import { defineConfig } from 'vitest/config';

// Suites that only pass on the macOS reference environment: a real Chromium (Playwright) and
// share-card goldens rendered by @napi-rs/canvas on macOS arm64, whose anti-aliasing differs on
// Linux (see golden/README.md). They are excluded unless `CP_MACOS_SUITES=1`, which the
// `critter-art-macos` CI job sets; the Linux job and a plain `pnpm test` leave them out.
const MACOS_SUITES = ['src/web/critter-sticker.test.ts', 'src/share/templates/templates.test.ts'];

// Unit tests only: golden (Chromium/Node canvas) comparisons run via the separate `golden` script
// so `pnpm --filter @cp/critter-art test` stays fast, deterministic and Chromium-free.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude:
      process.env['CP_MACOS_SUITES'] === '1'
        ? ['**/node_modules/**']
        : ['**/node_modules/**', ...MACOS_SUITES],
  },
});
