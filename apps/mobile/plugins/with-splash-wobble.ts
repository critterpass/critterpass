/**
 * Android 12+ launch splash: the egg wobbles once inside the system splash's icon mask. The
 * frames are the design's wobble keyframes rendered by tools/design-renders/export-app-icons.mjs
 * into assets/splash-android-wobble/, and assets/splash-android-wobble.xml lists them as an
 * `animation-list` that expo-splash-screen installs as the splash icon. This plugin copies the
 * frames into res/ and sets the splash theme's animation duration (the frames' total, under 1 s)
 * so Android 12 plays the icon rather than showing its first frame.
 *
 * Self-contained on purpose: Expo loads config plugins with Node's plain TypeScript stripping,
 * which cannot resolve relative extensionless imports.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { withAndroidStyles, withDangerousMod, type ConfigPlugin } from 'expo/config-plugins';

export const WOBBLE_FRAMES_DIR = join('assets', 'splash-android-wobble');
export const WOBBLE_DRAWABLE = join('assets', 'splash-android-wobble.xml');
/** Frames are drawn at xxxhdpi; lower densities scale them down. */
export const WOBBLE_RES_DIR = join('android', 'app', 'src', 'main', 'res', 'drawable-xxxhdpi');

const SPLASH_THEME = 'Theme.App.SplashScreen';
const DURATION_ITEM = 'windowSplashScreenAnimationDuration';
/** Android caps the splash icon animation at 1000 ms. */
const MAX_DURATION_MS = 1000;

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

/** The frame files the animation list references, in play order. */
export function wobbleFrames(projectRoot: string): string[] {
  return readdirSync(join(projectRoot, WOBBLE_FRAMES_DIR))
    .filter((file) => file.endsWith('.png'))
    .sort();
}

/** Total play time of the animation list: the sum of its items' durations. */
export function wobbleDurationMs(drawableXml: string): number {
  const durations = [...drawableXml.matchAll(/android:duration="(\d+)"/g)].map((m) => Number(m[1]));
  const total = durations.reduce((sum, ms) => sum + ms, 0);
  if (total <= 0 || total > MAX_DURATION_MS) {
    throw new Error(`splash wobble must last 1-${MAX_DURATION_MS} ms, got ${total} ms`);
  }
  return total;
}

/** Sets the splash theme's icon animation duration, replacing any earlier value. */
export function applyWobbleDuration<T extends Styles>(styles: T, durationMs: number): T {
  const theme = styles.resources.style?.find((style) => style.$.name === SPLASH_THEME);
  if (!theme) throw new Error(`${SPLASH_THEME} is missing: expo-splash-screen must run first`);
  theme.item = [
    ...(theme.item ?? []).filter((item) => item.$.name !== DURATION_ITEM),
    { $: { name: DURATION_ITEM }, _: String(durationMs) },
  ];
  return styles;
}

const withSplashWobble: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'android',
    (modConfig) => {
      const { projectRoot } = modConfig.modRequest;
      const target = join(projectRoot, WOBBLE_RES_DIR);
      mkdirSync(target, { recursive: true });
      for (const frame of wobbleFrames(projectRoot)) {
        copyFileSync(join(projectRoot, WOBBLE_FRAMES_DIR, frame), join(target, frame));
      }
      return modConfig;
    },
  ]);
  return withAndroidStyles(config, (modConfig) => {
    const xml = readFileSync(join(modConfig.modRequest.projectRoot, WOBBLE_DRAWABLE), 'utf8');
    modConfig.modResults = applyWobbleDuration(modConfig.modResults, wobbleDurationMs(xml));
    return modConfig;
  });
};

// Expo resolves a string-referenced config plugin through the module's default export.
// eslint-disable-next-line no-restricted-syntax -- config plugin entry, like a tool config
export default withSplashWobble;
