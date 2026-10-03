/**
 * The app's bundled faces as Skia typefaces, for images drawn on the phone (share cards). Skia's
 * system font manager knows the bundled faces on iOS but not on Android, where text drawn through
 * it comes out blank; reading the .ttf assets' bytes into typefaces works on both. Each face loads
 * once.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- assets and the native module load lazily, so importing this never forces them under Jest. */
/* eslint-disable lingui/no-unlocalized-strings -- font file names, never copy. */
import type * as RNSkiaModule from '@shopify/react-native-skia';
import type * as ExpoAssetModule from 'expo-asset';
import type * as ExpoFileSystemModule from 'expo-file-system';
import type { SkTypeface } from '@shopify/react-native-skia';

export type BundledFace =
  | 'Archivo-W70-900'
  | 'Archivo-W100-900'
  | 'Geist-500'
  | 'Geist-600'
  | 'GeistMono-500'
  | 'Borel-400';

function assetOf(face: BundledFace): number {
  switch (face) {
    case 'Archivo-W70-900':
      return require('../../../assets/fonts/Archivo-W70-900.ttf') as number;
    case 'Archivo-W100-900':
      return require('../../../assets/fonts/Archivo-W100-900.ttf') as number;
    case 'Geist-500':
      return require('../../../assets/fonts/Geist-500.ttf') as number;
    case 'Geist-600':
      return require('../../../assets/fonts/Geist-600.ttf') as number;
    case 'GeistMono-500':
      return require('../../../assets/fonts/GeistMono-500.ttf') as number;
    case 'Borel-400':
      return require('../../../assets/fonts/Borel-400.ttf') as number;
  }
}

const loaded = new Map<BundledFace, Promise<SkTypeface | null>>();

/** The face as a Skia typeface; null when its asset cannot be read (the caller draws without it). */
export function bundledTypeface(face: BundledFace): Promise<SkTypeface | null> {
  const cached = loaded.get(face);
  if (cached !== undefined) return cached;
  const { Skia } = require('@shopify/react-native-skia') as typeof RNSkiaModule;
  const { Asset } = require('expo-asset') as typeof ExpoAssetModule;
  const { File } = require('expo-file-system') as typeof ExpoFileSystemModule;
  // The asset copied to a local file first: a bundled asset's own URI is not a file Skia can read.
  const typeface = Asset.fromModule(assetOf(face))
    .downloadAsync()
    .then(async (asset) => {
      if (asset.localUri === null) return null;
      const bytes = await new File(asset.localUri).bytes();
      return Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(bytes));
    })
    .catch(() => null);
  loaded.set(face, typeface);
  return typeface;
}
