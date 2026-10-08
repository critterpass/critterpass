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
 *
 * Metro bundles every `import()` target into the app (it does not split them on native), so the
 * mobile app gets its own registry, `src/catalog-registry/index.native.ts` (Metro and the app's Jest
 * pick `.native.ts` over `.ts`): the shipped locales and the app's catalogs only, never a web or
 * server catalog. The pseudo-locale joins through `mobile/pseudo.ts`, which the app's Metro config
 * swaps for the empty `mobile/no-pseudo.ts` in production builds.
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import linguiConfig from '../lingui.config';
import { localeCodes, locales } from '../src/locales';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const registryDir = join(packageRoot, 'src', 'catalog-registry');

/** `.po` catalog names directly inside `dir`, prefixed with `prefix`. */
function poNamesIn(dir: string, prefix: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.po'))
    .map((entry) => `${prefix}${entry.name.slice(0, -'.po'.length)}`);
}

/**
 * Catalog names for a locale: every `.po` file already extracted for it (lingui.config.ts owns the
 * list), including one level of nested catalogs such as `notifications/common`.
 */
function catalogNamesFor(locale: string): string[] {
  const dir = join(packageRoot, 'locales', locale);
  const nested = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => poNamesIn(join(dir, entry.name), `${entry.name}/`));
  return [...poNamesIn(dir, ''), ...nested].sort();
}

/**
 * Catalog names whose sources include anything the app bundles (`apps/mobile/**`, or a shared
 * package's templates): the rest are read only by the web site or the services.
 */
function appCatalogNames(): Set<string> {
  const names = new Set<string>();
  for (const catalog of linguiConfig.catalogs ?? []) {
    const sources = catalog.include.map(String);
    if (sources.some((source) => /\/(apps\/mobile|packages)\//.test(source))) {
      names.add(catalog.path.replace('locales/{locale}/', ''));
    }
  }
  return names;
}

function writeLocaleRegistry(locale: string, catalogNames: string[], dir = registryDir): void {
  const target = dir === registryDir ? '../../locales' : '../../../locales';
  const lines = [
    "import type { Messages } from '@lingui/core';",
    '',
    '/** One loader per catalog for this locale; each import target is a literal path (see the generator comment for why). */',
    `export const catalogs: Record<string, () => Promise<Messages>> = {`,
    ...catalogNames.map(
      (name) =>
        `  ${JSON.stringify(name)}: () => import('${target}/${locale}/${name}').then((m) => m.messages),`,
    ),
    '};',
    '',
  ];
  writeFileSync(join(dir, `${locale}.ts`), lines.join('\n'), 'utf8');
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

/** The app's registry: shipped locales and app catalogs, plus the pseudo-locale outside production. */
function writeMobileRegistry(): number {
  const mobileDir = join(registryDir, 'mobile');
  mkdirSync(mobileDir, { recursive: true });
  const appCatalogs = appCatalogNames();
  const shipped = locales.filter((entry) => entry.shipped).map((entry) => entry.code);
  const pseudo = locales.find((entry) => entry.pseudo)?.code;
  for (const locale of pseudo ? [...shipped, pseudo] : shipped) {
    writeLocaleRegistry(
      locale,
      catalogNamesFor(locale).filter((name) => appCatalogs.has(name)),
      mobileDir,
    );
  }
  const loaders = 'Record<string, Record<string, () => Promise<Messages>>>';
  writeFileSync(
    join(mobileDir, 'pseudo.ts'),
    [
      "import type { Messages } from '@lingui/core';",
      '',
      ...(pseudo ? [`import { catalogs } from './${pseudo}';`, ''] : []),
      '/** The pseudo-locale for development and staging builds; production bundles `no-pseudo.ts`. */',
      `export const pseudoCatalogs: ${loaders} = {${pseudo ? ` ${JSON.stringify(pseudo)}: catalogs ` : ''}};`,
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(mobileDir, 'no-pseudo.ts'),
    [
      "import type { Messages } from '@lingui/core';",
      '',
      "/** Production builds: no pseudo-locale (the app's Metro config resolves `./pseudo` here). */",
      `export const pseudoCatalogs: ${loaders} = {};`,
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(registryDir, 'index.native.ts'),
    [
      "import type { Messages } from '@lingui/core';",
      '',
      ...shipped.map(
        (locale) => `import { catalogs as ${localeIdentifier(locale)} } from './mobile/${locale}';`,
      ),
      "import { pseudoCatalogs } from './mobile/pseudo';",
      '',
      "/** The app's registry: shipped locales and app catalogs only (see the generator). */",
      `export const catalogRegistry: ${loaders} = {`,
      ...shipped.map((locale) => `  ${JSON.stringify(locale)}: ${localeIdentifier(locale)},`),
      '  ...pseudoCatalogs,',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );
  return appCatalogs.size;
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
  const appCatalogCount = writeMobileRegistry();
  console.log(
    `wrote src/catalog-registry/ (${localeCodes.length} locales; app: ${appCatalogCount} catalogs)`,
  );
}

main();
