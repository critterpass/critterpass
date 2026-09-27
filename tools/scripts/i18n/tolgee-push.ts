/// <reference types="node" />
/**
 * Pushes the source (`en`) catalogs' keys to Tolgee so new or changed strings appear for
 * translators, carrying each key's extracted comment (screen/element context) and its catalog name
 * as a namespace so Tolgee's own UI can group keys the same way this repo does. New keys only —
 * Tolgee does not update an existing key's translations/tags on a repeat import (see
 * tolgee-client.ts), so a translator's in-progress work is never clobbered by a routine push.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { readPoEntries } from './po-catalog.js';
import type { TolgeeConfig, TolgeeKeyImport } from './tolgee-client.js';
import { importKeys, loadTolgeeConfig } from './tolgee-client.js';

export function collectSourceKeys(localesDir: string, sourceLocale: string): TolgeeKeyImport[] {
  const dir = join(localesDir, sourceLocale);
  if (!existsSync(dir)) return [];

  const keys: TolgeeKeyImport[] = [];
  for (const file of readdirSync(dir).filter((entry) => entry.endsWith('.po'))) {
    const namespace = file.slice(0, -'.po'.length);
    const entries = readPoEntries(readFileSync(join(dir, file), 'utf8'));
    for (const entry of entries) {
      keys.push({
        name: entry.id,
        namespace,
        translations: { [sourceLocale]: entry.translation },
        ...(entry.comment !== undefined ? { description: entry.comment } : {}),
      });
    }
  }
  return keys;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dry: { type: 'boolean', default: false },
      'locales-dir': { type: 'string' },
      'source-locale': { type: 'string', default: 'en' },
    },
  });

  const repoRoot = join(import.meta.dirname, '..', '..', '..');
  const localesDir = values['locales-dir'] ?? join(repoRoot, 'packages', 'i18n', 'locales');
  const sourceLocale = values['source-locale'];

  const keys = collectSourceKeys(localesDir, sourceLocale);
  console.log(`Collected ${String(keys.length)} source key(s) across ${new Set(keys.map((k) => k.namespace)).size} catalog(s).`);

  const config: TolgeeConfig | undefined = loadTolgeeConfig();
  if (values.dry || !config) {
    if (!values.dry) {
      console.log('TOLGEE_API_KEY/TOLGEE_PROJECT_ID not set — running in --dry mode (no request sent).');
    }
    console.log(JSON.stringify(keys.slice(0, 5), null, 2));
    if (keys.length > 5) console.log(`… and ${String(keys.length - 5)} more.`);
    return;
  }

  await importKeys(config, keys);
  console.log(`Pushed ${String(keys.length)} key(s) to Tolgee project ${config.projectId}.`);
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
