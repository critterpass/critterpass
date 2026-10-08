/**
 * The critter's share card, drawn on the phone with Skia: the post (1080×1350) or 9:16 story
 * (1080×1920) on paper, the found form's sticker, its name and "{tier} · found in {city}", in the
 * app's bundled faces, read from the font assets (Android's system font manager does not know
 * them, so text drawn through it comes out blank). Only found forms are shared, so a name on the
 * card is always the viewer's own. Also the phone's share hand-offs (share sheet, save to Photos).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- native modules load lazily, so importing this never forces them under Jest. */
/* eslint-disable lingui/no-unlocalized-strings -- file extensions, never copy. */
import type { FormSpec } from '@cp/critter-art';
import { tokens } from '@cp/design-tokens';
import type * as RNSkiaModule from '@shopify/react-native-skia';
import type * as ExpoFileSystemModule from 'expo-file-system';
import type * as MediaLibraryModule from 'expo-media-library';
import type * as SharingModule from 'expo-sharing';

import { bundledTypeface } from '@/ui/share-image/bundled-typefaces';
import type { ShareActionsDeps } from '@/ui/share-image/share-actions';
import { SHARE_SIZE, type ShareFormat } from '@/ui/share-image/ShareSheet';
import { renderStickerImage } from '@/ui/sticker/export-png';
import { getDefaultSkiaEngine } from '@/ui/sticker/Sticker';

export interface CritterCard {
  readonly kind: string;
  readonly seed: number;
  readonly form: FormSpec | null;
  readonly name: string;
  readonly line: string;
}

export async function renderCritterCard(
  card: CritterCard,
  format: ShareFormat,
): Promise<Uint8Array> {
  const { Skia } = require('@shopify/react-native-skia') as typeof RNSkiaModule;
  const [titleFace, lineFace] = await Promise.all([
    bundledTypeface('Archivo-W100-900'),
    bundledTypeface('Geist-600'),
  ]);
  const { w, h } = SHARE_SIZE[format];
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (surface === null) throw new Error('critter card: no surface');
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(tokens.color.paper.base));
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);

  const stickerPt = format === 'story' ? 560 : 520;
  const sticker = renderStickerImage(
    { kind: card.kind, seed: card.seed, ...(card.form === null ? {} : { form: card.form }) },
    stickerPt,
    1,
    getDefaultSkiaEngine(),
  );
  const top = format === 'story' ? 520 : 260;
  canvas.drawImageRect(
    sticker,
    Skia.XYWHRect(0, 0, sticker.width(), sticker.height()),
    Skia.XYWHRect((w - stickerPt) / 2, top, stickerPt, stickerPt),
    Skia.Paint(),
  );

  const title = Skia.Font(titleFace ?? undefined, 88);
  const line = Skia.Font(lineFace ?? undefined, 40);
  const ink = Skia.Paint();
  ink.setColor(Skia.Color(tokens.color.paper.ink));
  const name = card.name.toLocaleUpperCase();
  const nameY = top + stickerPt + 140;
  canvas.drawText(name, (w - title.measureText(name).width) / 2, nameY, ink, title);
  canvas.drawText(card.line, (w - line.measureText(card.line).width) / 2, nameY + 80, ink, line);

  surface.flush();
  const bytes = surface.makeImageSnapshot().encodeToBytes();
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
  };
  return deps;
}
