import { defineConfig } from 'tsdown';

// The benchmark bundled like the worker (workspace packages in, npm dependencies external), so it
// can run inside the worker's container next to its node_modules. BENCH_OUT_DIR: where to write.
export default defineConfig({
  entry: { 'blog-bench': './run.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: process.env['BENCH_OUT_DIR'] ?? '../../.bench-out',
  tsconfig: '../../tsconfig.json',
  clean: true,
  fixedExtension: false,
  deps: { alwaysBundle: [/^@cp\//] },
});
