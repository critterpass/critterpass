import { defineConfig } from 'vite';

// Static review gallery for `@cp/critter-art`'s form/tier model and epic poses (T8) -- not shipped,
// founder-review only. `pnpm --filter @cp/critter-art gallery` serves it locally; `gallery:build`
// produces static files the phase's own acceptance criteria checks for.
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
