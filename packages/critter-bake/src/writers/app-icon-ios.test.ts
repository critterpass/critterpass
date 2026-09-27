import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { APP_ICONS } from '../templates/app-icons';
import {
  findIctool,
  hexToExtendedSrgb,
  writeFlatAppIconSet,
  writeIconComposerBundle,
} from './app-icon-ios';

describe('hexToExtendedSrgb', () => {
  it('matches the literal format Icon Composer itself writes (confirmed by inspecting a real saved icon.json)', () => {
    expect(hexToExtendedSrgb('#ffd84a')).toBe('extended-srgb:1.00000,0.84706,0.29020,1.00000');
    expect(hexToExtendedSrgb('#000000')).toBe('extended-srgb:0.00000,0.00000,0.00000,1.00000');
    expect(hexToExtendedSrgb('#ffffff')).toBe('extended-srgb:1.00000,1.00000,1.00000,1.00000');
  });
});

describe('findIctool', () => {
  it('resolves a real, existing ictool path on macOS with Xcode 26+ installed', () => {
    if (process.platform !== 'darwin') {
      expect(findIctool()).toBeUndefined();
      return;
    }
    const path = findIctool();
    if (path === undefined) return; // no Xcode/Icon Composer on this machine — nothing to assert.
    expect(path.endsWith('/ictool')).toBe(true);
    expect(existsSync(path)).toBe(true);
  });
});

describe('writeIconComposerBundle', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes a real, empirically-verified icon.json schema plus the referenced Assets PNG', async () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-icon-composer-'));
    const def = APP_ICONS.find((entry) => entry.id === 'face');
    if (!def) throw new Error('expected a "face" APP_ICONS entry');

    await writeIconComposerBundle(dir, def);

    const bundleDir = join(dir, 'face.icon');
    const iconJsonPath = join(bundleDir, 'icon.json');
    expect(existsSync(iconJsonPath)).toBe(true);
    const iconJson = JSON.parse(readFileSync(iconJsonPath, 'utf8')) as {
      fill: { solid: string };
      groups: { layers: { 'image-name': string; name: string }[] }[];
      'supported-platforms': { circles: string[]; squares: string };
    };
    expect(iconJson.fill.solid).toMatch(/^extended-srgb:/);
    expect(iconJson.groups).toHaveLength(1);
    expect(iconJson.groups[0]?.layers).toHaveLength(1);
    expect(iconJson['supported-platforms'].squares).toBe('shared');

    const imageName = iconJson.groups[0]?.layers[0]?.['image-name'];
    expect(imageName).toBeTruthy();
    expect(existsSync(join(bundleDir, 'Assets', imageName ?? ''))).toBe(true);
  });
});

describe('writeFlatAppIconSet', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('exports 3 real light/dark/tinted PNGs via ictool from an already-written .icon bundle', async () => {
    const ictoolPath = findIctool();
    if (!ictoolPath) return; // no Xcode/Icon Composer on this machine — nothing to assert for real.

    dir = mkdtempSync(join(tmpdir(), 'critter-bake-flat-icon-'));
    const def = APP_ICONS.find((entry) => entry.id === 'golden');
    if (!def) throw new Error('expected a "golden" APP_ICONS entry');

    await writeIconComposerBundle(dir, def);
    writeFlatAppIconSet(join(dir, 'golden.icon'), dir, def, ictoolPath, 128);

    const setDir = join(dir, 'golden.appiconset');
    const contents = JSON.parse(readFileSync(join(setDir, 'Contents.json'), 'utf8')) as {
      images: { filename: string; appearances?: { appearance: string; value: string }[] }[];
    };
    expect(contents.images).toHaveLength(3);
    for (const image of contents.images) {
      const filePath = join(setDir, image.filename);
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath).length).toBeGreaterThan(0);
    }
    const dark = contents.images.find((image) => image.filename.endsWith('-dark.png'));
    expect(dark?.appearances).toEqual([{ appearance: 'luminosity', value: 'dark' }]);
    const any = contents.images.find((image) => image.filename.endsWith('-any.png'));
    expect(any?.appearances).toBeUndefined();
  });
});
