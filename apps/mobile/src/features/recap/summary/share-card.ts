/**
 * The recap's share card, drawn on the phone with Skia as the recap page itself reads: the post
 * (1080×1350) or 9:16 story (1080×1920) on the app's ink, the dates and crew over "{PLACE}, THE
 * RECAP" with the guide's sticker beside it, the four stat tiles in their colours with their
 * numbers and captions, and the wordmark, in the app's bundled faces. Also the phone's share hand-offs
 * (share sheet, save to Photos).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- native modules load lazily, so importing this never forces them under Jest. */
/* eslint-disable lingui/no-unlocalized-strings -- font names, the wordmark and file extensions, never copy. */
import { tokens } from '@cp/design-tokens';
import type * as RNSkiaModule from '@shopify/react-native-skia';
import type * as ExpoFileSystemModule from 'expo-file-system';
import type * as MediaLibraryModule from 'expo-media-library';
import type * as SharingModule from 'expo-sharing';
import { Linking } from 'react-native';

import { bundledTypeface } from '@/ui/share-image/bundled-typefaces';
import type { ShareFormat } from '@/ui/share-image/ShareImageSheet';
import type { ShareActionsDeps } from '@/ui/share-image/share-actions';
import { renderStickerImage } from '@/ui/sticker/export-png';
import { getDefaultSkiaEngine } from '@/ui/sticker/Sticker';

import type { TileCopy } from './summary-copy';

export interface RecapShareCard {
  readonly guideKind: string;
  /** The page's title, one entry per line ("ĐÀ NẴNG," / "THE RECAP"). */
  readonly title: readonly string[];
  readonly eyebrow: string;
  readonly tiles: readonly TileCopy[];
}

export const SHARE_SIZE: Readonly<Record<ShareFormat, { readonly w: number; readonly h: number }>> =
  {
    post: { w: 1080, h: 1350 },
    story: { w: 1080, h: 1920 },
  };
const MARGIN = 80;
const GAP = 32;
const STICKER_PT = 260;
/** The recap page's tile colours, in its order, and each tile's hand-set lean. */
const TILE_FILLS = [
  tokens.color.yellow,
  tokens.color.pink,
  tokens.color.blue,
  tokens.color.green.base,
] as const;
const TILE_LEANS = [-1.5, 1.5, 1, -1] as const;
const WORDMARK = 'CRITTERPASS';

export async function renderRecapCard(
  card: RecapShareCard,
  format: ShareFormat,
): Promise<Uint8Array> {
  const { Skia } = require('@shopify/react-native-skia') as typeof RNSkiaModule;
  const [heavyFace, labelFace, bodyFace] = await Promise.all([
    bundledTypeface('Archivo-W70-900'),
    bundledTypeface('Geist-600'),
    bundledTypeface('Geist-500'),
  ]);
  const { w, h } = SHARE_SIZE[format];
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (surface === null) throw new Error('recap card: no surface');
  const canvas = surface.getCanvas();
  const fill = (colour: string) => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(colour));
    return paint;
  };
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), fill(tokens.color.ink['930']));

  const story = format === 'story';
  const top = story ? 230 : 90;
  const sticker = renderStickerImage(
    { kind: card.guideKind, seed: 7 },
    STICKER_PT,
    1,
    getDefaultSkiaEngine(),
  );
  canvas.drawImageRect(
    sticker,
    Skia.XYWHRect(0, 0, sticker.width(), sticker.height()),
    Skia.XYWHRect(w - MARGIN - STICKER_PT, top - 20, STICKER_PT, STICKER_PT),
    Skia.Paint(),
  );

  const heavy = heavyFace ?? undefined;
  // The largest size up to `size` at which `text` fits `width`.
  const fitted = (text: string, size: number, width: number, face = heavy, floor = 28) => {
    let font = Skia.Font(face, size);
    for (let next = size; font.measureText(text).width > width && next > floor;) {
      next -= 2;
      font = Skia.Font(face, next);
    }
    return font;
  };
  const cream = fill(tokens.color.paper.base);
  const ink = fill(tokens.color.ink['950']);
  const quiet = fill(tokens.color.paper.base);
  quiet.setAlphaf(0.6);

  let y = top + 60;
  const eyebrowText = card.eyebrow.toLocaleUpperCase();
  const beside = w - 2 * MARGIN - STICKER_PT - GAP;
  canvas.drawText(
    eyebrowText,
    MARGIN,
    y,
    quiet,
    fitted(eyebrowText, 34, beside, labelFace ?? undefined),
  );
  y += 40;
  // The title's lines share one size: the largest at which the longest fits beside the sticker.
  const lines = card.title.map((line) => line.toLocaleUpperCase());
  const titleSize = Math.min(
    ...lines.map((line) => fitted(line, 132, beside, heavy, 56).getSize()),
  );
  const titleFont = Skia.Font(heavy, titleSize);
  for (const line of lines) {
    y += titleSize * 0.98;
    canvas.drawText(line, MARGIN, y, cream, titleFont);
  }
  y += story ? 110 : 70;

  const tileW = (w - 2 * MARGIN - GAP) / 2;
  const tileH = story ? 330 : 270;
  const pad = 36;
  card.tiles.slice(0, 4).forEach((tile, index) => {
    const x = MARGIN + (index % 2) * (tileW + GAP);
    const tileY = y + Math.floor(index / 2) * (tileH + GAP);
    canvas.save();
    canvas.rotate(TILE_LEANS[index] ?? 0, x + tileW / 2, tileY + tileH / 2);
    canvas.drawRRect(
      Skia.RRectXY(Skia.XYWHRect(x, tileY, tileW, tileH), 56, 56),
      fill(TILE_FILLS[index] ?? tokens.color.yellow),
    );
    const valueText = tile.value.toLocaleUpperCase();
    const captionFont = fitted(tile.caption, 34, tileW - 2 * pad, bodyFace ?? undefined, 22);
    canvas.drawText(
      valueText,
      x + pad,
      tileY + tileH - pad - 58,
      ink,
      fitted(valueText, 84, tileW - 2 * pad, heavy, 36),
    );
    canvas.drawText(tile.caption, x + pad, tileY + tileH - pad - 6, ink, captionFont);
    canvas.restore();
  });

  canvas.drawText(
    WORDMARK,
    MARGIN,
    h - (story ? 150 : 70),
    quiet,
    Skia.Font(labelFace ?? undefined, 30),
  );

  surface.flush();
  const bytes = surface.makeImageSnapshot().encodeToBytes();
  if (bytes === null) throw new Error('recap card: the image did not encode');
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
      const file = new File(Paths.cache, `recap-${Date.now()}.${extension}`);
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
