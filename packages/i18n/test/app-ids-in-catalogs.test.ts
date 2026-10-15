/// <reference types="node" />
/**
 * Every message id the app words is in a catalog. An id the extractor never sees (a file no
 * catalog includes, or a `t` passed in as a parameter instead of the macro's own) still renders,
 * from its English fallback, so nothing fails until a traveller on another language sees English.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');
const appSource = join(repoRoot, 'apps/mobile/src');
const sourceCatalogs = join(here, '../locales/en');

function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'node_modules'
        ? []
        : filesUnder(path, keep);
    }
    return keep(entry.name) ? [path] : [];
  });
}

/** The ids the source catalogs hold. */
function catalogIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of filesUnder(sourceCatalogs, (name) => name.endsWith('.po'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/^msgid "(.+)"$/gm)) {
      if (match[1] !== undefined) ids.add(match[1]);
    }
  }
  return ids;
}

// A descriptor (`t({ id, message })`, `msg({ id, message })`) or a `<Trans id="…">`.
const DESCRIPTOR = /\bid:\s*['"`]([a-z][\w-]*(?:\.[\w-]+)+)['"`]\s*,\s*message:/g;
const TRANS = /<Trans\s+id=["']([a-z][\w-]*(?:\.[\w-]+)+)["']/g;

/** Source without its comments, so an id in an example never counts. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Each worded id the app's source uses, with the first file that uses it. */
function appIds(): Map<string, string> {
  const ids = new Map<string, string>();
  const source = filesUnder(
    appSource,
    (name) => /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name),
  );
  for (const file of source) {
    const text = withoutComments(readFileSync(file, 'utf8'));
    for (const match of [...text.matchAll(DESCRIPTOR), ...text.matchAll(TRANS)]) {
      const id = match[1];
      if (id !== undefined && !ids.has(id)) ids.set(id, relative(repoRoot, file));
    }
  }
  return ids;
}

describe('app message ids', () => {
  it('finds the worded ids in the app', () => {
    expect(appIds().size).toBeGreaterThan(1000);
  });

  it('are each in a catalog, so every language can translate them', () => {
    const known = catalogIds();
    const missing = [...appIds()]
      .filter(([id]) => !known.has(id))
      .map(([id, file]) => `${id} (${file})`);
    expect(missing).toEqual([]);
  });
});
