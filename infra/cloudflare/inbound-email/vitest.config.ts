import { defineConfig } from 'vitest/config';

// The handler is plain web-platform code with its bindings injected, so it runs under Node; the
// Email Worker entry (src/index.ts, `cloudflare:email`) is exercised by wrangler's dry-run build.
export default defineConfig({
  test: { name: '@cp/inbound-email', include: ['test/**/*.test.ts'] },
});
