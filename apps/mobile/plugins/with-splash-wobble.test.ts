/**
 * The launch icon and splash wiring: every variant's icon files and the splash images exist and
 * have the sizes the platforms expect, and the Android splash wobble plays in under a second on
 * the splash theme expo-splash-screen writes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { SPLASH_PLUGIN_OPTIONS, appIcons } from '../app.config';
import {
  WOBBLE_DRAWABLE,
  applyWobbleDuration,
  wobbleDurationMs,
  wobbleFrames,
} from './with-splash-wobble';

const APP_ROOT = join(__dirname, '..');

/** Width and height from a PNG's IHDR chunk. */
function pngSize(relative: string): { width: number; height: number } {
  const bytes = readFileSync(join(APP_ROOT, relative));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('app icons', () => {
  it.each(['development', 'staging', 'production'] as const)(
    'every %s icon is a 1024 px square on disk',
    (variant) => {
      const { icon, ios, adaptiveIcon } = appIcons(variant);
      const files = [icon, ...Object.values(ios), ...Object.values(adaptiveIcon)];
      for (const file of files) {
        expect(existsSync(join(APP_ROOT, file))).toBe(true);
        expect(pngSize(file)).toEqual({ width: 1024, height: 1024 });
      }
    },
  );

  it('labels only pre-release icons', () => {
    expect(appIcons('production').icon).toBe('./assets/icon.png');
    expect(appIcons('staging').icon).toBe('./assets/icon-staging.png');
    expect(appIcons('development').adaptiveIcon.foregroundImage).toBe(
      './assets/android-icon-foreground-development.png',
    );
  });
});

describe('launch splash', () => {
  it('ships the launch image at 3x its point width on the app background', () => {
    const { image, imageWidth, backgroundColor } = SPLASH_PLUGIN_OPTIONS;
    expect(backgroundColor).toBe('#17142a');
    expect(pngSize(image)).toEqual({ width: imageWidth * 3, height: imageWidth * 3 });
  });

  it('lists every wobble frame, each 288 dp at xxxhdpi', () => {
    const xml = readFileSync(join(APP_ROOT, WOBBLE_DRAWABLE), 'utf8');
    const frames = wobbleFrames(APP_ROOT);
    expect(frames.length).toBeGreaterThan(1);
    for (const frame of frames) {
      expect(xml).toContain(`@drawable/${frame.replace('.png', '')}"`);
      expect(pngSize(join('assets', 'splash-android-wobble', frame))).toEqual({
        width: 288 * 4,
        height: 288 * 4,
      });
    }
    expect(wobbleDurationMs(xml)).toBeLessThan(1000);
  });

  it('rejects a wobble that would outlast the system splash animation cap', () => {
    const item = '<item android:drawable="@drawable/f" android:duration="600" />';
    expect(() => wobbleDurationMs(item + item)).toThrow(/1-1000 ms/);
  });

  it('sets the icon animation duration on the splash theme, once', () => {
    const styles = {
      resources: {
        style: [
          { $: { name: 'AppTheme' }, item: [] },
          {
            $: { name: 'Theme.App.SplashScreen', parent: 'Theme.SplashScreen' },
            item: [
              { $: { name: 'windowSplashScreenAnimatedIcon' }, _: '@drawable/splashscreen_logo' },
              { $: { name: 'windowSplashScreenAnimationDuration' }, _: '500' },
            ],
          },
        ],
      },
    };
    const theme = applyWobbleDuration(styles, 960).resources.style[1];
    expect(theme?.item).toEqual([
      { $: { name: 'windowSplashScreenAnimatedIcon' }, _: '@drawable/splashscreen_logo' },
      { $: { name: 'windowSplashScreenAnimationDuration' }, _: '960' },
    ]);
  });

  it('fails loudly when the splash theme is missing', () => {
    expect(() => applyWobbleDuration({ resources: { style: [] } }, 960)).toThrow(
      /expo-splash-screen must run first/,
    );
  });
});
