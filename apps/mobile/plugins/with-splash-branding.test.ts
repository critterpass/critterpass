/**
 * The launch icon and splash wiring: every variant's icon files exist with the sizes the platforms
 * expect, the splash images match the point sizes the config gives them, and the Android
 * branding image lands on the splash theme expo-splash-screen writes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { LAUNCH_GROUND, SPLASH_PLUGIN_OPTIONS, appIcons } from '../app.config';
import { BRAND_IMAGES, applyBrandingImage } from './with-splash-branding';

const APP_ROOT = join(__dirname, '..');

/** Width and height from a PNG's IHDR chunk. */
function pngSize(relative: string): { width: number; height: number } {
  const bytes = readFileSync(join(APP_ROOT, relative));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const LAYERS = ['art', 'mono', 'ground', 'ground-dark'];

describe('app icons', () => {
  it.each(['development', 'staging', 'production'] as const)(
    'every %s icon file is on disk at 1024 px',
    (variant) => {
      const { icon, ios, adaptiveIcon } = appIcons(variant);
      for (const file of [icon, ...Object.values(adaptiveIcon)]) {
        expect(pngSize(file)).toEqual({ width: 1024, height: 1024 });
      }
      const document = JSON.parse(readFileSync(join(APP_ROOT, ios, 'icon.json'), 'utf8')) as {
        groups: { layers: { 'image-name': string }[] }[];
      };
      const images = document.groups.flatMap((group) =>
        group.layers.map((layer) => layer['image-name']),
      );
      for (const layer of LAYERS) expect(images).toContain(`${layer}.png`);
      for (const image of images) {
        expect(pngSize(join(ios, 'Assets', image))).toEqual({ width: 1024, height: 1024 });
      }
    },
  );

  it('labels only pre-release icons', () => {
    expect(appIcons('production').icon).toBe('./assets/icon.png');
    expect(appIcons('production').ios).toBe('./assets/app-icons/ios/passport.icon');
    expect(appIcons('staging').ios).toBe('./assets/app-icons/ios/passport-staging.icon');
    expect(appIcons('development').adaptiveIcon.foregroundImage).toBe(
      './assets/android-icon-foreground-development.png',
    );
    expect(existsSync(join(APP_ROOT, appIcons('staging').ios, 'Assets', 'badge.png'))).toBe(true);
    expect(existsSync(join(APP_ROOT, appIcons('production').ios, 'Assets', 'badge.png'))).toBe(
      false,
    );
  });
});

describe('launch splash', () => {
  it('ships the iOS launch images at 3x their point width on the launch grounds', () => {
    const { image, imageWidth, backgroundColor, dark } = SPLASH_PLUGIN_OPTIONS;
    expect(backgroundColor).toBe(LAUNCH_GROUND.light);
    expect(dark.backgroundColor).toBe(LAUNCH_GROUND.dark);
    for (const file of [image, dark.image]) {
      expect(pngSize(file)).toEqual({ width: imageWidth * 3, height: imageWidth * 3 });
    }
  });

  it('ships the Android splash icon at xxxhdpi, light and night', () => {
    const { android } = SPLASH_PLUGIN_OPTIONS;
    for (const file of [android.image, android.dark.image]) {
      expect(pngSize(file)).toEqual({
        width: android.imageWidth * 4,
        height: android.imageWidth * 4,
      });
    }
  });

  it('draws the branding wordmark at the 200 × 80 dp Android gives it', () => {
    for (const file of Object.values(BRAND_IMAGES)) {
      expect(pngSize(file)).toEqual({ width: 800, height: 320 });
    }
  });

  it('sets the branding image on the splash theme, once', () => {
    const styles = {
      resources: {
        style: [
          { $: { name: 'AppTheme' }, item: [] },
          {
            $: { name: 'Theme.App.SplashScreen', parent: 'Theme.SplashScreen' },
            item: [{ $: { name: 'windowSplashScreenBackground' }, _: '@color/bg' }],
          },
        ],
      },
    };
    const twice = applyBrandingImage(applyBrandingImage(styles));
    const theme = twice.resources.style[1];
    expect(theme?.item).toEqual([
      { $: { name: 'windowSplashScreenBackground' }, _: '@color/bg' },
      {
        $: { name: 'android:windowSplashScreenBrandingImage' },
        _: '@drawable/splashscreen_brand',
      },
    ]);
  });

  it('refuses to run before expo-splash-screen has written the splash theme', () => {
    expect(() => applyBrandingImage({ resources: { style: [] } })).toThrow(/expo-splash-screen/);
  });
});
