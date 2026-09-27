import { defineConfig } from 'vitest/config';

// Renders design/App Icon.dc.html in a real Chromium (Playwright), so it runs only where
// `CP_MACOS_SUITES=1` (the `critter-art-macos` CI job, which installs Chromium); see
// packages/critter-art/vitest.config.ts.
const MACOS_SUITES = ['src/templates/app-icons-design-fidelity.test.ts'];

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude:
      process.env['CP_MACOS_SUITES'] === '1'
        ? ['**/node_modules/**']
        : ['**/node_modules/**', ...MACOS_SUITES],
    testTimeout: 30_000,
  },
});
