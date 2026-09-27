import { defineConfig } from 'vite';

// Static review gallery for `@cp/critter-art`'s form/tier model and epic poses -- not shipped,
// founder-review only. `pnpm --filter @cp/critter-art gallery` serves it locally; `gallery:build`
// produces the static files a reviewer opens directly.
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
