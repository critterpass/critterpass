/**
 * The recap's share card, drawn on the phone with Skia: the post (1080×1350) or 9:16 story
 * (1080×1920) on paper, the guide's sticker, "{PLACE}, THE RECAP", the dates and crew, and the stat
 * tiles' numbers with their captions, in the app's bundled faces. Also the phone's share hand-offs
 * (share sheet, save to Photos).
 */
/* eslint-disable @typescript-eslint/no-require-imports -- native modules load lazily, so importing this never forces them under Jest. */
/* eslint-disable lingui/no-unlocalized-strings -- font names and file extensions, never copy. */
import { tokens } from '@cp/design-tokens';
import type * as RNSkiaModule from '@shopify/react-native-skia';
import type * as ExpoFileSystemModule from 'expo-file-system';
import type * as MediaLibraryModule from 'expo-media-library';
import type * as SharingModule from 'expo-sharing';
import { Linking } from 'react-native';

import type { ShareFormat } from '@/ui/share-image/ShareImageSheet';
import type { ShareActionsDeps } from '@/ui/share-image/share-actions';
import { renderStickerImage } from '@/ui/sticker/export-png';
import { getDefaultSkiaEngine } from '@/ui/sticker/Sticker';

import type { TileCopy } from './summary-copy';

export interface RecapShareCard {
  readonly guideKind: string;
  readonly title: string;
  readonly eyebrow: string;
  readonly tiles: readonly TileCopy[];
}

const SIZE: Readonly<Record<ShareFormat, { readonly w: number; readonly h: number }>> = {
  post: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};
const MARGIN = 90;
const STICKER_PT = 280;

export function renderRecapCard(card: RecapShareCard, format: ShareFormat): Promise<Uint8Array> {
  const { Skia } = require('@shopify/react-native-skia') as typeof RNSkiaModule;
  const { w, h } = SIZE[format];
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (surface === null) return Promise.reject(new Error('recap card: no surface'));
  const canvas = surface.getCanvas();
  const paper = Skia.Paint();
  paper.setColor(Skia.Color(tokens.color.paper.base));
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paper);

  const top = format === 'story' ? 220 : 90;
  const sticker = renderStickerImage(
    { kind: card.guideKind, seed: 7 },
    STICKER_PT,
    1,
    getDefaultSkiaEngine(),
  );
  canvas.drawImageRect(
    sticker,
    Skia.XYWHRect(0, 0, sticker.width(), sticker.height()),
    Skia.XYWHRect(w - MARGIN - STICKER_PT, top, STICKER_PT, STICKER_PT),
    Skia.Paint(),
  );

  const fonts = Skia.FontMgr.System();
  const eyebrow = Skia.Font(fonts.matchFamilyStyle('Geist-600', { weight: 600 }), 34);
  const heavy = fonts.matchFamilyStyle('Archivo-W70-900', { weight: 900 });
  // The largest size up to `size` at which `text` fits the card's width.
  const fitted = (text: string, size: number) => {
    let font = Skia.Font(heavy, size);
    for (let next = size; font.measureText(text).width > w - 2 * MARGIN && next > 40;) {
      next -= 4;
      font = Skia.Font(heavy, next);
    }
    return font;
  };
  const caption = Skia.Font(fonts.matchFamilyStyle('Geist-500', { weight: 500 }), 36);
  const ink = Skia.Paint();
  ink.setColor(Skia.Color(tokens.color.paper.ink));
  const muted = Skia.Paint();
  muted.setColor(Skia.Color(tokens.color.paper.muted));

  let y = top + STICKER_PT + 80;
  canvas.drawText(card.eyebrow.toLocaleUpperCase(), MARGIN, y, muted, eyebrow);
  y += 120;
  const titleText = card.title.toLocaleUpperCase();
  canvas.drawText(titleText, MARGIN, y, ink, fitted(titleText, 104));
  y += format === 'story' ? 180 : 120;
  const step = format === 'story' ? 210 : 150;
  for (const tile of card.tiles) {
    const valueText = tile.value.toLocaleUpperCase();
    canvas.drawText(valueText, MARGIN, y, ink, fitted(valueText, 72));
    canvas.drawText(tile.caption, MARGIN, y + 56, muted, caption);
    y += step;
  }

  surface.flush();
  const bytes = surface.makeImageSnapshot().encodeToBytes();
  return bytes === null
    ? Promise.reject(new Error('recap card: the image did not encode'))
    : Promise.resolve(bytes);
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
