/**
 * Pins plugins/with-critter-art.ts's per-extension imageset list to what the extensions' Swift
 * sources actually name, and checks the reduced catalog it writes into each target directory.
 */
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { IOS_EXTENSION_CRITTER_ART, writeExtensionCatalog } from './with-critter-art';

const projectRoot = join(__dirname, '..');
const targetsDir = join(projectRoot, 'targets');
const generatedCatalog = join(
  projectRoot,
  'generated',
  'critter-art',
  'ios',
  'CritterArt.xcassets',
);

// Not extensions of the app: shared Swift compiled into them, and the App Clip with its own assets.
const NON_EXTENSION_DIRS = new Set(['_shared', 'app-clip']);

const catalogNames = new Set(
  readdirSync(generatedCatalog)
    .filter((entry) => entry.endsWith('.imageset'))
    .map((entry) => entry.slice(0, -'.imageset'.length)),
);

function swiftFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.swift'))
    .filter((entry) => !entry.parentPath.split('/').includes('Tests'))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Every Swift string literal under `dir` that names a critter art imageset. */
function catalogNamesUsedIn(dir: string): string[] {
  const used = new Set<string>();
  for (const file of swiftFiles(dir)) {
    for (const match of readFileSync(file, 'utf8').matchAll(/"([^"\\\n]+)"/g)) {
      const literal = match[1];
      if (literal !== undefined && catalogNames.has(literal)) used.add(literal);
    }
  }
  return [...used].sort();
}

describe('with-critter-art extension catalogs', () => {
  it('lists every extension target directory', () => {
    const extensionDirs = readdirSync(targetsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !NON_EXTENSION_DIRS.has(entry.name))
      .map((entry) => entry.name)
      .sort();
    expect(Object.keys(IOS_EXTENSION_CRITTER_ART).sort()).toEqual(extensionDirs);
  });

  it('embeds exactly the imagesets each extension names in its Swift sources', () => {
    for (const [targetDirName, imagesets] of Object.entries(IOS_EXTENSION_CRITTER_ART)) {
      expect({
        target: targetDirName,
        imagesets: catalogNamesUsedIn(join(targetsDir, targetDirName)),
      }).toEqual({
        target: targetDirName,
        imagesets: [...imagesets].sort(),
      });
    }
  });

  it('keeps shared extension Swift free of critter art (it would need every target to embed it)', () => {
    expect(catalogNamesUsedIn(join(targetsDir, '_shared'))).toEqual([]);
  });

  it('writes a catalog of only the listed imagesets, byte-identical to the generated ones', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'critter-art-')), 'CritterArt.xcassets');
    const imagesets = IOS_EXTENSION_CRITTER_ART['notification-service'] ?? [];
    writeExtensionCatalog(generatedCatalog, out, imagesets);

    expect(readdirSync(out).sort()).toEqual(
      ['Contents.json', ...imagesets.map((name) => `${name}.imageset`)].sort(),
    );
    for (const name of imagesets) {
      const dir = `${name}.imageset`;
      for (const file of readdirSync(join(generatedCatalog, dir))) {
        expect(
          readFileSync(join(out, dir, file)).equals(
            readFileSync(join(generatedCatalog, dir, file)),
          ),
        ).toBe(true);
      }
    }
  });

  it('removes a catalog an earlier prebuild left behind when the target draws no critter art', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'critter-art-')), 'CritterArt.xcassets');
    mkdirSync(join(out, 'stale.imageset'), { recursive: true });
    writeFileSync(join(out, 'Contents.json'), '{}');

    writeExtensionCatalog(generatedCatalog, out, []);

    expect(existsSync(out)).toBe(false);
  });

  it('fails the prebuild when a listed imageset is not in the generated art', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'critter-art-')), 'CritterArt.xcassets');
    expect(() => writeExtensionCatalog(generatedCatalog, out, ['not-a-critter'])).toThrow(
      'not-a-critter.imageset',
    );
  });
});
