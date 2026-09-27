/// <reference types="node" />
/**
 * Writes `src/catalog-registry/<locale>.ts`, one committed file per locale mapping each catalog
 * name to a loader for its compiled output (`locales/<locale>/<area>.ts`).
 *
 * `loadCatalog` cannot use a plain `import(\`../locales/${locale}/${area}.js\`)`: every bundler this
 * package runs under (Metro for the mobile app; Vite for the web app and this package's own Vitest
 * suite) requires dynamic `import()` arguments to be literal strings it can discover ahead of time —
 * Metro rejects a non-constant argument outright, and Vite's glob-based analysis of a two-variable
 * template (locale *and* area both dynamic) reports "Unknown variable dynamic import" even when the
 * target file exists on disk (confirmed by running the package's own tests against both forms).
 * A generated, literal-per-entry registry is the portable fix. The registry only encodes *which
 * files exist* (the locale × catalog matrix from lingui.config.ts), never translated content, so —
 * unlike the compiled catalogs themselves — it is committed and only needs regenerating when a
 * locale or catalog is added or removed, not on every translation change.
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { localeCodes } from '../src/locales';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const registryDir = join(packageRoot, 'src', 'catalog-registry');

/** Catalog names for a locale: every `.po` file already extracted for it (lingui.config.ts owns the list). */
function catalogNamesFor(locale: string): string[] {
  const dir = join(packageRoot, 'locales', locale);
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.po'))
    .map((entry) => entry.name.slice(0, -'.po'.length))
    .sort();
}

function writeLocaleRegistry(locale: string, catalogNames: string[]): void {
  const lines = [
    "import type { Messages } from '@lingui/core';",
    '',
    '/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */',
    `export const catalogs: Record<string, () => Promise<Messages>> = {`,
    ...catalogNames.map(
      (name) =>
        `  ${JSON.stringify(name)}: () => import('../../locales/${locale}/${name}').then((m) => m.messages),`,
    ),
    '};',
    '',
  ];
  writeFileSync(join(registryDir, `${locale}.ts`), lines.join('\n'), 'utf8');
}

function writeIndex(locales: string[]): void {
  const lines = [
    "import type { Messages } from '@lingui/core';",
    '',
    ...locales.map(
      (locale) => `import { catalogs as ${localeIdentifier(locale)} } from './${locale}';`,
    ),
    '',
    '/** Locale code -> catalog name -> loader, generated from the locale registry and the extracted `.po` catalogs. */',
    `export const catalogRegistry: Record<string, Record<string, () => Promise<Messages>>> = {`,
    ...locales.map((locale) => `  ${JSON.stringify(locale)}: ${localeIdentifier(locale)},`),
    '};',
    '',
  ];
  writeFileSync(join(registryDir, 'index.ts'), lines.join('\n'), 'utf8');
}

/** `zh-Hans` / `en-XA` are not valid identifier characters; only used for the generated import binding. */
function localeIdentifier(locale: string): string {
  return `locale_${locale.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function main(): void {
  mkdirSync(registryDir, { recursive: true });
  for (const locale of localeCodes) {
    writeLocaleRegistry(locale, catalogNamesFor(locale));
  }
  writeIndex([...localeCodes]);
  console.log(`wrote src/catalog-registry/ (${localeCodes.length} locales)`);
}

main();
