/**
 * Registers every bundled font file with `expo-font` (design-system.md §1.3). The `expo-font` config
 * plugin (apps/mobile/app.config.ts) embeds these as native assets, so there is no network fetch;
 * `useFonts` still performs the `Font.loadAsync` registration, the same way in Expo Go, a dev client
 * and a standalone build.
 *
 * Metro resolves asset imports by static analysis, so each font needs its own literal import; this
 * list mirrors tools/scripts/fonts/build-fonts.py's output and must stay in sync with
 * apps/mobile/assets/fonts/*.ttf.
 */
import { useFonts } from 'expo-font';

import archivoW62700 from '../../../assets/fonts/Archivo-W62-700.ttf';
import archivoW62800 from '../../../assets/fonts/Archivo-W62-800.ttf';
import archivoW62900 from '../../../assets/fonts/Archivo-W62-900.ttf';
import archivoW66700 from '../../../assets/fonts/Archivo-W66-700.ttf';
import archivoW66800 from '../../../assets/fonts/Archivo-W66-800.ttf';
import archivoW66900 from '../../../assets/fonts/Archivo-W66-900.ttf';
import archivoW70700 from '../../../assets/fonts/Archivo-W70-700.ttf';
import archivoW70800 from '../../../assets/fonts/Archivo-W70-800.ttf';
import archivoW70900 from '../../../assets/fonts/Archivo-W70-900.ttf';
import archivoW78700 from '../../../assets/fonts/Archivo-W78-700.ttf';
import archivoW78800 from '../../../assets/fonts/Archivo-W78-800.ttf';
import archivoW78900 from '../../../assets/fonts/Archivo-W78-900.ttf';
import archivoW100700 from '../../../assets/fonts/Archivo-W100-700.ttf';
import archivoW100800 from '../../../assets/fonts/Archivo-W100-800.ttf';
import archivoW100900 from '../../../assets/fonts/Archivo-W100-900.ttf';
import geist400 from '../../../assets/fonts/Geist-400.ttf';
import geist500 from '../../../assets/fonts/Geist-500.ttf';
import geist600 from '../../../assets/fonts/Geist-600.ttf';
import geist700 from '../../../assets/fonts/Geist-700.ttf';
import geist800 from '../../../assets/fonts/Geist-800.ttf';
import geistMono400 from '../../../assets/fonts/GeistMono-400.ttf';
import geistMono500 from '../../../assets/fonts/GeistMono-500.ttf';
import geistMono700 from '../../../assets/fonts/GeistMono-700.ttf';
import caveat600 from '../../../assets/fonts/Caveat-600.ttf';
import caveat700 from '../../../assets/fonts/Caveat-700.ttf';
import notoSansThai400 from '../../../assets/fonts/NotoSansThai-400.ttf';
import notoSansThai900 from '../../../assets/fonts/NotoSansThai-900.ttf';

const FONT_ASSETS = {
  'Archivo-W62-700': archivoW62700,
  'Archivo-W62-800': archivoW62800,
  'Archivo-W62-900': archivoW62900,
  'Archivo-W66-700': archivoW66700,
  'Archivo-W66-800': archivoW66800,
  'Archivo-W66-900': archivoW66900,
  'Archivo-W70-700': archivoW70700,
  'Archivo-W70-800': archivoW70800,
  'Archivo-W70-900': archivoW70900,
  'Archivo-W78-700': archivoW78700,
  'Archivo-W78-800': archivoW78800,
  'Archivo-W78-900': archivoW78900,
  'Archivo-W100-700': archivoW100700,
  'Archivo-W100-800': archivoW100800,
  'Archivo-W100-900': archivoW100900,
  'Geist-400': geist400,
  'Geist-500': geist500,
  'Geist-600': geist600,
  'Geist-700': geist700,
  'Geist-800': geist800,
  'GeistMono-400': geistMono400,
  'GeistMono-500': geistMono500,
  'GeistMono-700': geistMono700,
  'Caveat-600': caveat600,
  'Caveat-700': caveat700,
  'NotoSansThai-400': notoSansThai400,
  'NotoSansThai-900': notoSansThai900,
} as const;

/** Every bundled family name `fontFor` (resolve.ts) can return, for the splash-hide prewarm pass. */
export const BUNDLED_FONT_FAMILIES: readonly string[] = Object.keys(FONT_ASSETS);

/** `true` once every bundled font is registered and ready for `fontFamily` styles to use. */
export function useFontsReady(): boolean {
  const [loaded] = useFonts(FONT_ASSETS);
  return loaded;
}
