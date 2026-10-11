/**
 * Android 12+ launch splash: expo-splash-screen sets the background and the icon (the passport
 * icon in a circle, light and night); this adds the "CritterPass" wordmark as the splash branding
 * image, which expo-splash-screen does not write. The wordmark is Borel, so it is an image
 * (system splashes draw no app fonts), exported with the icons by
 * tools/design-renders/export-app-icons.mjs at 200 × 80 dp, the size Android gives the branding.
 *
 * Self-contained on purpose: Expo loads config plugins with Node's plain TypeScript stripping,
 * which cannot resolve relative extensionless imports.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { withAndroidStyles, withDangerousMod, type ConfigPlugin } from 'expo/config-plugins';

export const BRAND_IMAGES = {
  light: join('assets', 'launch', 'android-brand.png'),
  dark: join('assets', 'launch', 'android-brand-dark.png'),
};
const RES_DIR = join('android', 'app', 'src', 'main', 'res');
/** Drawn at xxxhdpi; lower densities scale it down. */
const DENSITY_DIRS = { light: 'drawable-xxxhdpi', dark: 'drawable-night-xxxhdpi' };
const DRAWABLE = 'splashscreen_brand';

const SPLASH_THEME = 'Theme.App.SplashScreen';
const BRANDING_ITEM = 'android:windowSplashScreenBrandingImage';

interface StyleItem {
  $: { name: string };
  _: string;
}
interface Style {
  $: { name: string; parent?: string };
  item?: StyleItem[];
}
interface Styles {
  resources: { style?: Style[] };
}

/** Sets the splash theme's branding image, replacing any earlier value. */
export function applyBrandingImage<T extends Styles>(styles: T): T {
  const theme = styles.resources.style?.find((style) => style.$.name === SPLASH_THEME);
  if (!theme) throw new Error(`${SPLASH_THEME} is missing: expo-splash-screen must run first`);
  theme.item = [
    ...(theme.item ?? []).filter((item) => item.$.name !== BRANDING_ITEM),
    { $: { name: BRANDING_ITEM }, _: `@drawable/${DRAWABLE}` },
  ];
  return styles;
}

const withSplashBranding: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'android',
    (modConfig) => {
      const { projectRoot } = modConfig.modRequest;
      for (const look of ['light', 'dark'] as const) {
        const target = join(projectRoot, RES_DIR, DENSITY_DIRS[look]);
        mkdirSync(target, { recursive: true });
        copyFileSync(join(projectRoot, BRAND_IMAGES[look]), join(target, `${DRAWABLE}.png`));
      }
      return modConfig;
    },
  ]);
  return withAndroidStyles(config, (modConfig) => {
    modConfig.modResults = applyBrandingImage(modConfig.modResults);
    return modConfig;
  });
};

// Expo resolves a string-referenced config plugin through the module's default export.
// eslint-disable-next-line no-restricted-syntax -- config plugin entry, like a tool config
export default withSplashBranding;
