import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const nodeRequire = createRequire(import.meta.url);

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * `artVersion` = a hash of the critter-art source that actually decides pixels (kind draw
 * functions, form/tier palettes, core geometry) plus the manifest file's own content — bumping
 * either invalidates every cached output, per F-008's determinism contract.
 */
export function computeArtVersion(manifestPath: string): string {
  const artEntry = nodeRequire.resolve('@cp/critter-art');
  const artSrcDir = dirname(artEntry); // .../packages/critter-art/src

  const files = [
    ...globSync('kinds/**/*.ts', { cwd: artSrcDir }),
    ...globSync('forms/**/*.ts', { cwd: artSrcDir }),
    ...globSync('core/**/*.ts', { cwd: artSrcDir }),
  ]
    .filter((f) => !f.endsWith('.test.ts'))
    .sort();

  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(join(artSrcDir, file)));
  }
  hash.update(readFileSync(manifestPath));
  return hash.digest('hex');
}

export interface HashCache {
  readonly artVersion: string;
  readonly entries: Record<string, string>;
}

const EMPTY_CACHE: HashCache = { artVersion: '', entries: {} };

export function loadHashCache(path: string): HashCache {
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (
      typeof raw === 'object' &&
      raw !== null &&
      'artVersion' in raw &&
      'entries' in raw &&
      typeof (raw as { artVersion: unknown }).artVersion === 'string' &&
      typeof (raw as { entries: unknown }).entries === 'object'
    ) {
      return raw as HashCache;
    }
    return EMPTY_CACHE;
  } catch {
    return EMPTY_CACHE;
  }
}

export function saveHashCache(path: string, cache: HashCache): void {
  mkdirSync(dirname(path), { recursive: true });
  const sortedEntries: Record<string, string> = {};
  for (const key of Object.keys(cache.entries).sort()) {
    const value = cache.entries[key];
    if (value !== undefined) sortedEntries[key] = value;
  }
  const canonical: HashCache = { artVersion: cache.artVersion, entries: sortedEntries };
  writeFileSync(path, `${JSON.stringify(canonical, null, 2)}\n`, 'utf8');
}
