/// <reference types="node" />
/**
 * Release gate for the launch-language completeness promise (docs/code-standards.md §8: "missing
 * keys fail the build for complete locales"; product-decisions.md §7 (platform and scope) lists the
 * launch set). Compares every shipped, non-source locale's `.po` catalogs against the source
 * locale's own ids and flags a missing or empty translation, and runs a structural ICU-syntax check
 * on every non-empty message (source included, since a broken source message is still broken).
 *
 * `--mode warn` (pull requests): reports findings as GitHub Actions warning annotations, exit 0.
 * `--mode release` (release branches/tags): reports as error annotations, exit 1 if anything is found.
 * `--dry`: points at this script's own fixture catalogs instead of the real package, so the gate's
 * own logic is testable without depending on the ever-changing real translation state.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { checkIcuSyntax } from './icu-check.js';
import { readPoEntries } from './po-catalog.js';

export interface LocaleRegistryEntry {
  readonly code: string;
  readonly shipped: boolean;
}

export interface Finding {
  readonly kind: 'missing' | 'broken-icu';
  readonly locale: string;
  readonly catalog: string;
  readonly id: string;
  readonly detail?: string;
}

export interface FindFindingsOptions {
  readonly localesDir: string;
  readonly registryPath: string;
  readonly sourceLocale?: string;
}

function loadShippedLocales(registryPath: string): string[] {
  const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as LocaleRegistryEntry[];
  return registry.filter((entry) => entry.shipped).map((entry) => entry.code);
}

function catalogsFor(localesDir: string, locale: string): string[] {
  const dir = join(localesDir, locale);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.po'))
    .map((file) => file.slice(0, -'.po'.length))
    .sort();
}

/** Pure check over already-extracted `.po` catalogs; safe to unit test without depending on real, ever-changing translation state. */
export function findFindings(options: FindFindingsOptions): Finding[] {
  const { localesDir, registryPath, sourceLocale = 'en' } = options;
  const findings: Finding[] = [];
  const shippedLocales = loadShippedLocales(registryPath);
  const sourceCatalogs = catalogsFor(localesDir, sourceLocale);

  for (const catalog of sourceCatalogs) {
    const sourceEntries = readPoEntries(
      readFileSync(join(localesDir, sourceLocale, `${catalog}.po`), 'utf8'),
    );
    for (const entry of sourceEntries) {
      const icuError = checkIcuSyntax(entry.translation);
      if (icuError) {
        findings.push({
          kind: 'broken-icu',
          locale: sourceLocale,
          catalog,
          id: entry.id,
          detail: icuError,
        });
      }
    }

    for (const locale of shippedLocales) {
      if (locale === sourceLocale) continue;
      const catalogPath = join(localesDir, locale, `${catalog}.po`);
      const translated = new Map(
        existsSync(catalogPath)
          ? readPoEntries(readFileSync(catalogPath, 'utf8')).map((entry) => [
              entry.id,
              entry.translation,
            ])
          : [],
      );

      for (const { id } of sourceEntries) {
        const translation = translated.get(id);
        if (!translation) {
          findings.push({ kind: 'missing', locale, catalog, id });
          continue;
        }
        const icuError = checkIcuSyntax(translation);
        if (icuError) findings.push({ kind: 'broken-icu', locale, catalog, id, detail: icuError });
      }
    }
  }

  return findings;
}

export function describeFinding(finding: Finding): string {
  const where = `${finding.locale}/${finding.catalog}.po "${finding.id}"`;
  return finding.kind === 'missing'
    ? `missing translation: ${where}`
    : `broken ICU (${finding.detail}): ${where}`;
}

function main(): void {
  const scriptDir = import.meta.dirname;
  const repoRoot = join(scriptDir, '..', '..', '..');

  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: 'warn' },
      dry: { type: 'boolean', default: false },
      'locales-dir': { type: 'string' },
      registry: { type: 'string' },
      'source-locale': { type: 'string', default: 'en' },
    },
  });

  const mode = values.mode;
  if (mode !== 'warn' && mode !== 'release') {
    console.error(`--mode must be "warn" or "release", got "${mode}"`);
    process.exitCode = 2;
    return;
  }

  const localesDir =
    values['locales-dir'] ??
    (values.dry
      ? join(scriptDir, 'fixtures', 'incomplete', 'locales')
      : join(repoRoot, 'packages', 'i18n', 'locales'));
  const registryPath =
    values.registry ??
    (values.dry
      ? join(scriptDir, 'fixtures', 'incomplete', 'locales.json')
      : join(repoRoot, 'packages', 'i18n', 'generated', 'locales.json'));

  if (!existsSync(registryPath)) {
    console.error(
      `locale registry not found at ${registryPath} — run "pnpm --filter @cp/i18n compile" first (it writes this file).`,
    );
    process.exitCode = 2;
    return;
  }

  const findings = findFindings({
    localesDir,
    registryPath,
    sourceLocale: values['source-locale'],
  });

  const annotation = mode === 'release' ? 'error' : 'warning';
  for (const finding of findings) {
    // GitHub Actions workflow command format, so findings surface in the PR's Checks UI.
    console.log(`::${annotation}::${describeFinding(finding)}`);
  }
  if (findings.length === 0) {
    console.log(`i18n completeness check: no missing translations or broken ICU (mode=${mode}).`);
  }

  process.exitCode = mode === 'release' && findings.length > 0 ? 1 : 0;
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main();
}
