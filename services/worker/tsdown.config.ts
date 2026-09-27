import { defineConfig } from 'tsdown';

// Workspace packages ship TypeScript sources, so they are bundled in; npm dependencies stay external.
export default defineConfig({
  entry: ['src/index.ts', 'src/obs/instrument.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  fixedExtension: false,
  deps: { alwaysBundle: [/^@cp\//] },
});
