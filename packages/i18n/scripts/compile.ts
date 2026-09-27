/// <reference types="node" />
/**
 * Compiles the `.po` catalogs into TypeScript bundles (one per locale per area, lingui.config.ts),
 * regenerates the committed catalog-loader registry (generate-catalog-registry.ts) so it matches
 * whatever catalogs exist, and projects the locale registry to a plain JSON file. Non-code tooling
 * outside this package (tools/scripts/i18n's release gate) reads that JSON from disk instead of
 * importing `@cp/i18n` as a package, since a script under `tools/scripts` cannot declare a
 * dependency on another workspace package without editing `tools/scripts/package.json`, which this
 * phase does not own.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { locales } from '../src/locales.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function compileCatalogs(): void {
  // Compiled catalogs are covered by this package's own tsconfig (so ESLint's type-aware parser
  // does not choke on an untracked file) and linted like any other TS output; the CLI's default
  // `/*eslint-disable*/` header would otherwise trip this repo's `reportUnusedDisableDirectives`
  // setting on the (rule-clean) generated code, so it is turned off here instead.
  const result = spawnSync('lingui', ['compile', '--output-prefix', '', ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function writeCatalogLoaderRegistry(): void {
  execFileSync('tsx', [join(packageRoot, 'scripts', 'generate-catalog-registry.ts')], {
    stdio: 'inherit',
  });
}

function writeLocaleMetadataJson(): void {
  const outPath = join(packageRoot, 'generated', 'locales.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(locales, null, 2)}\n`, 'utf8');
  console.log(`wrote generated/locales.json (${locales.length} locales)`);
}

compileCatalogs();
writeCatalogLoaderRegistry();
writeLocaleMetadataJson();
