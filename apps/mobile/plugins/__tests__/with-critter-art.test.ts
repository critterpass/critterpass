/**
 * Integration check for `with-critter-art`'s prebuild output — run `expo prebuild` first
 * (`pnpm --filter @cp/mobile exec expo prebuild --clean --no-install`), then this test:
 * `pnpm --filter @cp/mobile test -- plugins/with-critter-art`. Running the test alone (no prior
 * prebuild) fails with a clear message rather than silently skipping, since a stale/missing `ios/`
 * or `android/` directory is exactly the regression this test exists to catch.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { IOS_EXTENSION_CRITTER_ART } from '../with-critter-art';

const projectRoot = join(__dirname, '..', '..');
const iosDir = join(projectRoot, 'ios');
const androidResDir = join(projectRoot, 'android', 'app', 'src', 'main', 'res');
const targetsDir = join(projectRoot, 'targets');

function findMainAppXcassets(): string | undefined {
  if (!existsSync(iosDir)) return undefined;
  for (const entry of readdirSync(iosDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.endsWith('.xcodeproj')) continue;
    const candidate = join(iosDir, entry.name, 'CritterArt.xcassets');
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

describe('with-critter-art (requires a prior `expo prebuild`)', () => {
  it('has an ios/ and android/ directory to check (run `expo prebuild` first if this fails)', () => {
    expect(existsSync(iosDir)).toBe(true);
    expect(existsSync(androidResDir)).toBe(true);
  });

  it('copies CritterArt.xcassets into the main iOS app target', () => {
    const xcassets = findMainAppXcassets();
    expect(xcassets).toBeDefined();
    expect(existsSync(join(xcassets!, 'Contents.json'))).toBe(true);
  });

  it('gives each extension target only the critter art it draws', () => {
    for (const [name, imagesets] of Object.entries(IOS_EXTENSION_CRITTER_ART)) {
      const targetDir = join(targetsDir, name);
      if (!existsSync(targetDir)) continue; // a target this checkout hasn't prebuilt yet
      const xcassets = join(targetDir, 'CritterArt.xcassets');
      if (imagesets.length === 0) {
        expect(existsSync(xcassets)).toBe(false);
        continue;
      }
      expect(readdirSync(xcassets).sort()).toEqual(
        ['Contents.json', ...imagesets.map((imageset) => `${imageset}.imageset`)].sort(),
      );
    }
  });

  it('copies drawables into the Android density buckets the manifest actually bakes (@2x/@3x -> xhdpi/xxhdpi)', () => {
    for (const density of ['drawable-xhdpi', 'drawable-xxhdpi']) {
      const dir = join(androidResDir, density);
      expect(existsSync(dir)).toBe(true);
      const files = readdirSync(dir);
      expect(files.some((name) => name.startsWith('critter_'))).toBe(true);
    }
  });
});
