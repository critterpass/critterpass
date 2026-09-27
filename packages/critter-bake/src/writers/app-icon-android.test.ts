import { loadImage } from '@napi-rs/canvas';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { APP_ICONS } from '../templates/app-icons';
import { writeAndroidAdaptiveIcon, writeAndroidBackgroundColors } from './app-icon-android';

describe('writeAndroidAdaptiveIcon', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes a foreground PNG (also the monochrome source), an adaptive-icon XML, and non-empty alpha content', async () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-android-icon-'));
    const def = APP_ICONS.find((entry) => entry.id === 'sticker');
    if (!def) throw new Error('expected a "sticker" APP_ICONS entry');

    await writeAndroidAdaptiveIcon(dir, def, 128);

    const foregroundPath = join(dir, 'drawable-xxxhdpi', 'ic_launcher_foreground_sticker.png');
    expect(existsSync(foregroundPath)).toBe(true);
    const image = await loadImage(readFileSync(foregroundPath));
    expect(image.width).toBe(128);
    expect(image.height).toBe(128);

    const xmlPath = join(dir, 'mipmap-anydpi-v26', 'ic_launcher_sticker.xml');
    expect(existsSync(xmlPath)).toBe(true);
    const xml = readFileSync(xmlPath, 'utf8');
    expect(xml).toContain('<adaptive-icon');
    expect(xml).toContain('@color/ic_launcher_background_sticker');
    expect(xml).toContain(
      '<foreground android:drawable="@drawable/ic_launcher_foreground_sticker"/>',
    );
    // Android's themed-icon system only reads a drawable's alpha channel, so reusing the same
    // foreground file as the monochrome source is correct, not a shortcut — see the writer's doc.
    expect(xml).toContain(
      '<monochrome android:drawable="@drawable/ic_launcher_foreground_sticker"/>',
    );
  });

  it('translates an id with a hyphen into a valid Android resource name', async () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-android-icon-'));
    const def = APP_ICONS.find((entry) => entry.id === 'bali-six');
    if (!def) throw new Error('expected a "bali-six" APP_ICONS entry');

    await writeAndroidAdaptiveIcon(dir, def, 64);

    expect(existsSync(join(dir, 'drawable-xxxhdpi', 'ic_launcher_foreground_bali_six.png'))).toBe(
      true,
    );
    expect(existsSync(join(dir, 'mipmap-anydpi-v26', 'ic_launcher_bali_six.xml'))).toBe(true);
  });
});

describe('writeAndroidBackgroundColors', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes one <color> entry per icon, each a real hex value', () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-android-colors-'));
    writeAndroidBackgroundColors(dir, APP_ICONS);

    const xml = readFileSync(join(dir, 'values', 'ic_launcher_background_colors.xml'), 'utf8');
    expect(xml).toContain('<resources>');
    for (const def of APP_ICONS) {
      const slug = def.id.replace(/-/g, '_');
      expect(xml).toContain(
        `<color name="ic_launcher_background_${slug}">${def.backgroundHex}</color>`,
      );
    }
  });
});
