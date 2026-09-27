/// <reference types="node" />
/**
 * Pulls reviewed translations from Tolgee back into this repo's `.po` catalogs. Tolgee's export
 * groups files by locale directory (`<locale>/<namespace>.po`, the common layout for a multi-file
 * translation export) — worth confirming against a real project once one exists (see the report);
 * running in `--dry` mode until then only reports what a real pull would overwrite, never touching
 * a file. Unzips with the system `unzip` binary (present on GitHub's own runners and macOS/Linux
 * dev machines) rather than adding a zip-reading dependency to tools/scripts/package.json, which is
 * outside this phase's file ownership.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import type { TolgeeConfig } from './tolgee-client.js';
import { exportTranslations, loadTolgeeConfig } from './tolgee-client.js';

export interface PulledFile {
  readonly locale: string;
  readonly catalog: string;
  readonly sourcePath: string;
}

/** Finds every `.po` file in an extracted export and maps it to a (locale, catalog) pair from its
 * `<locale>/<catalog>.po` path. */
export function locatePulledFiles(extractedDir: string): PulledFile[] {
  const files: PulledFile[] = [];
  for (const localeDir of readdirSync(extractedDir, { withFileTypes: true })) {
    if (!localeDir.isDirectory()) continue;
    const localePath = join(extractedDir, localeDir.name);
    for (const file of readdirSync(localePath)) {
      if (!file.endsWith('.po')) continue;
      files.push({
        locale: localeDir.name,
        catalog: file.slice(0, -'.po'.length),
        sourcePath: join(localePath, file),
      });
    }
  }
  return files;
}

function applyPulledFiles(files: readonly PulledFile[], localesDir: string): void {
  for (const file of files) {
    const targetDir = join(localesDir, file.locale);
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(file.sourcePath, join(targetDir, `${file.catalog}.po`));
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dry: { type: 'boolean', default: false },
      'locales-dir': { type: 'string' },
    },
  });

  const repoRoot = join(import.meta.dirname, '..', '..', '..');
  const localesDir = values['locales-dir'] ?? join(repoRoot, 'packages', 'i18n', 'locales');

  const config: TolgeeConfig | undefined = loadTolgeeConfig();
  if (values.dry || !config) {
    if (!values.dry) {
      console.log(
        'TOLGEE_API_KEY/TOLGEE_PROJECT_ID not set — running in --dry mode (no request sent).',
      );
    }
    console.log(
      `Would pull reviewed translations into ${localesDir} (no request sent in --dry mode).`,
    );
    return;
  }

  const zip = await exportTranslations(config, { filterState: ['TRANSLATED', 'REVIEWED'] });
  const workDir = mkdtempSync(join(tmpdir(), 'cp-tolgee-pull-'));
  try {
    const zipPath = join(workDir, 'export.zip');
    writeFileSync(zipPath, Buffer.from(zip));
    const extractedDir = join(workDir, 'extracted');
    mkdirSync(extractedDir);
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', extractedDir]);

    const files = locatePulledFiles(extractedDir);
    applyPulledFiles(files, localesDir);
    console.log(
      `Pulled ${String(files.length)} catalog file(s) from Tolgee project ${config.projectId}.`,
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
