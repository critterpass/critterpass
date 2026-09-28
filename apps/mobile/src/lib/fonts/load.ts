/**
 * The bundled font families (design-system.md §1.3). The `expo-font` config plugin
 * (apps/mobile/app.config.ts) embeds apps/mobile/assets/fonts/*.ttf in the native app: iOS
 * registers them from `UIAppFonts` and Android reads them from `assets/fonts/` before any JS runs.
 * Each file's PostScript name equals its file name, which is the `fontFamily` value `fontFor`
 * (resolve.ts) returns, so text can use them from the first frame.
 *
 * The files are deliberately not imported here: a Metro asset import ships every font a second
 * time among the JS bundle's assets, and `expo-font` never reads that copy because it skips
 * families the native side already reports as loaded. load.test.ts keeps this list, the plugin's
 * list and the font directory in step (tools/scripts/fonts/build-fonts.py writes the files).
 */
export const BUNDLED_FONT_FAMILIES: readonly string[] = [
  'Archivo-W62-700',
  'Archivo-W62-800',
  'Archivo-W62-900',
  'Archivo-W66-700',
  'Archivo-W66-800',
  'Archivo-W66-900',
  'Archivo-W70-700',
  'Archivo-W70-800',
  'Archivo-W70-900',
  'Archivo-W78-700',
  'Archivo-W78-800',
  'Archivo-W78-900',
  'Archivo-W100-700',
  'Archivo-W100-800',
  'Archivo-W100-900',
  'Geist-400',
  'Geist-500',
  'Geist-600',
  'Geist-700',
  'Geist-800',
  'GeistMono-400',
  'GeistMono-500',
  'GeistMono-700',
  'Caveat-600',
  'Caveat-700',
  'NotoSansThai-400',
  'NotoSansThai-900',
];

/**
 * `true` once every bundled font is ready for `fontFamily` styles. The native embed registers them
 * before JS starts, so they are ready on the first render.
 */
export function useFontsReady(): boolean {
  return true;
}
