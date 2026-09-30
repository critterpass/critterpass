/**
 * The critter's share card (the post and 9:16 story from `@cp/critter-art`'s `critter-card`
 * template), rendered on the phone with the app's bundled fonts from the system font manager, and
 * the phone's share hand-offs (system share sheet, save to Photos). Only found forms are shared,
 * so a name on the card is always the viewer's own.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- native modules load lazily, so importing this never forces them under Jest. */
/* eslint-disable lingui/no-unlocalized-strings -- font names, file extensions and URLs, never copy. */
import {
  buildCritterCard,
  buildCritterCardStory,
  type CritterCardProps,
} from '@cp/critter-art/share/templates';
import type { SkTypeface } from '@shopify/react-native-skia';
import type * as RNSkiaModule from '@shopify/react-native-skia';
import type * as ExpoFileSystemModule from 'expo-file-system';
import type * as MediaLibraryModule from 'expo-media-library';
import type * as SharingModule from 'expo-sharing';
import { Linking } from 'react-native';

import type { ShareFormat } from '@/ui/share-image/ShareImageSheet';
import type { ShareActionsDeps } from '@/ui/share-image/share-actions';
import { renderShareImage } from '@/ui/share-image/render';

/** The template's families and the bundled faces that draw them. */
const FACES: Readonly<Record<string, { readonly face: string; readonly weight: number }>> = {
  Archivo: { face: 'Archivo-W100-800', weight: 800 },
  Geist: { face: 'Geist-500', weight: 500 },
};

let fonts: Map<string, SkTypeface> | null = null;

function shareFonts(): ReadonlyMap<string, SkTypeface> {
  if (fonts !== null) return fonts;
  const { Skia } = require('@shopify/react-native-skia') as typeof RNSkiaModule;
  const manager = Skia.FontMgr.System();
  fonts = new Map();
  for (const [family, { face, weight }] of Object.entries(FACES)) {
    try {
      fonts.set(family, manager.matchFamilyStyle(face, { weight }));
    } catch {
      // The renderer falls back to the default face for a family it has no typeface for.
    }
  }
  return fonts;
}

export async function renderCritterCard(
  props: CritterCardProps,
  format: ShareFormat,
): Promise<Uint8Array> {
  const layout = format === 'story' ? buildCritterCardStory(props) : buildCritterCard(props);
  const image = await renderShareImage(layout, shareFonts());
  const bytes = image.encodeToBytes();
  if (bytes === null) throw new Error('critter card: the image did not encode');
  return bytes;
}

let deps: ShareActionsDeps | null = null;

export function deviceShareDeps(): ShareActionsDeps {
  if (deps !== null) return deps;
  const { File, Paths } = require('expo-file-system') as typeof ExpoFileSystemModule;
  const sharing = require('expo-sharing') as typeof SharingModule;
  const media = require('expo-media-library') as typeof MediaLibraryModule;
  deps = {
    writeTempFile: async (bytes, extension) => {
      const file = new File(Paths.cache, `critter-${Date.now()}.${extension}`);
      file.create({ overwrite: true });
      await file.write(bytes);
      return file.uri;
    },
    deleteFile: (uri) => {
      const file = new File(uri);
      if (file.exists) file.delete();
      return Promise.resolve();
    },
    sharing: { isAvailableAsync: sharing.isAvailableAsync, shareAsync: sharing.shareAsync },
    mediaLibrary: {
      requestPermissionsAsync: (writeOnly) => media.requestPermissionsAsync(writeOnly),
      createAssetAsync: (uri) => media.createAssetAsync(uri),
    },
    canOpenURL: (url) => Linking.canOpenURL(url),
  };
  return deps;
}
