/**
 * The memory's share image, drawn on the phone with Skia (post 1080×1350 or story 1080×1920): the
 * highlight photo fading into the night (the hatched placeholder's ink without one), "ONE YEAR AGO
 * TODAY", "{PLACE}, A YEAR ON", the day and its moment, the guide's sticker, and the crew's
 * signatures from the trip's stamp, each in their colour (their drawn stroke, else their name).
 */
/* eslint-disable lingui/no-unlocalized-strings -- font names and errors, never copy. */
/* eslint-disable @typescript-eslint/no-require-imports -- Skia loads lazily, so importing this never forces it under Jest. */
import { tokens } from '@cp/design-tokens';
import type * as RNSkiaModule from '@shopify/react-native-skia';

import { bundledTypeface } from '@/ui/share-image/bundled-typefaces';
import type { ShareFormat } from '@/ui/share-image/ShareImageSheet';
import { renderStickerImage } from '@/ui/sticker/export-png';
import { getDefaultSkiaEngine } from '@/ui/sticker/Sticker';

import type { SignatureStroke } from '../signature/stroke';

export interface MemoryShareSigner {
  readonly name: string;
  readonly colour: string;
  readonly stroke: SignatureStroke | null;
}

export interface MemoryShareCard {
  readonly guideKind: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  /** The photo's encoded bytes; null draws the night alone. */
  readonly photo: Uint8Array | null;
  readonly signers: readonly MemoryShareSigner[];
}

const SIZE: Readonly<Record<ShareFormat, { readonly w: number; readonly h: number }>> = {
  post: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};
const MARGIN = 90;
const STICKER_PT = 220;
const SIGN = { w: 280, h: 110, gap: 30 };

/** Words wrapped to `width` with `font`, greedily. */
function wrap(text: string, width: number, measure: (line: string) => number): readonly string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/u)) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && measure(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
}

export async function renderMemoryCard(
  card: MemoryShareCard,
  format: ShareFormat,
): Promise<Uint8Array> {
  const { Skia, TileMode, PaintStyle, StrokeCap } =
    require('@shopify/react-native-skia') as typeof RNSkiaModule;
  const [heavyFace, labelFace, bodyFace, handFace] = await Promise.all([
    bundledTypeface('Archivo-W70-900'),
    bundledTypeface('Geist-600'),
    bundledTypeface('Geist-500'),
    bundledTypeface('Borel-400'),
  ]);
  const { w, h } = SIZE[format];
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (surface === null) throw new Error('memory card: no surface');
  const canvas = surface.getCanvas();
  const night = tokens.color.ink['900'];
  const fill = Skia.Paint();
  fill.setColor(Skia.Color(night));
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), fill);

  const photoH = Math.round(h * 0.5);
  const image =
    card.photo === null ? null : Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(card.photo));
  if (image !== null) {
    const scale = Math.max(w / image.width(), photoH / image.height());
    const sw = w / scale;
    const sh = photoH / scale;
    canvas.drawImageRect(
      image,
      Skia.XYWHRect((image.width() - sw) / 2, (image.height() - sh) / 2, sw, sh),
      Skia.XYWHRect(0, 0, w, photoH),
      Skia.Paint(),
    );
  } else {
    fill.setColor(Skia.Color(tokens.color.ink['850']));
    canvas.drawRect(Skia.XYWHRect(0, 0, w, photoH), fill);
  }
  const fade = Skia.Paint();
  fade.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: 0, y: photoH * 0.45 },
      { x: 0, y: photoH },
      [Skia.Color(`${night}00`), Skia.Color(night)],
      null,
      TileMode.Clamp,
    ),
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, w, photoH), fade);

  const sticker = renderStickerImage(
    { kind: card.guideKind, seed: 7 },
    STICKER_PT,
    1,
    getDefaultSkiaEngine(),
  );
  canvas.drawImageRect(
    sticker,
    Skia.XYWHRect(0, 0, sticker.width(), sticker.height()),
    Skia.XYWHRect(w - MARGIN - STICKER_PT, photoH - STICKER_PT - 20, STICKER_PT, STICKER_PT),
    Skia.Paint(),
  );

  const paper = Skia.Paint();
  paper.setColor(Skia.Color(tokens.color.paper.base));
  const muted = Skia.Paint();
  muted.setColor(Skia.Color(tokens.color.ink['300']));
  const yellow = Skia.Paint();
  yellow.setColor(Skia.Color(tokens.color.yellow));

  const label = Skia.Font(labelFace ?? undefined, 32);
  const eyebrow = card.eyebrow.toLocaleUpperCase();
  const pad = 22;
  const top = format === 'story' ? 200 : 80;
  canvas.drawRRect(
    Skia.RRectXY(
      Skia.XYWHRect(MARGIN, top, label.measureText(eyebrow).width + 2 * pad, 60),
      30,
      30,
    ),
    yellow,
  );
  const inkOnYellow = Skia.Paint();
  inkOnYellow.setColor(Skia.Color(tokens.color.ink['900']));
  canvas.drawText(eyebrow, MARGIN + pad, top + 42, inkOnYellow, label);

  let y = photoH + 40;
  let size = 104;
  let heavy = Skia.Font(heavyFace ?? undefined, size);
  const title = card.title.toLocaleUpperCase();
  while (heavy.measureText(title).width > w - 2 * MARGIN && size > 48) {
    size -= 4;
    heavy = Skia.Font(heavyFace ?? undefined, size);
  }
  canvas.drawText(title, MARGIN, y, paper, heavy);
  y += 80;
  const body = Skia.Font(bodyFace ?? undefined, 42);
  for (const line of wrap(card.body, w - 2 * MARGIN, (s) => body.measureText(s).width)) {
    canvas.drawText(line, MARGIN, y, muted, body);
    y += 58;
  }

  y += 40;
  const hand = Skia.Font(handFace ?? undefined, 44);
  let x = MARGIN;
  for (const signer of card.signers) {
    if (x + SIGN.w > w - MARGIN) {
      x = MARGIN;
      y += SIGN.h + SIGN.gap;
    }
    if (y + SIGN.h > h - 40) break;
    const ink = Skia.Paint();
    ink.setColor(Skia.Color(signer.colour));
    const path = signer.stroke === null ? null : Skia.Path.MakeFromSVGString(signer.stroke.path);
    if (signer.stroke !== null && path !== null) {
      const scale = Math.min(SIGN.w / signer.stroke.width, SIGN.h / signer.stroke.height);
      ink.setStyle(PaintStyle.Stroke);
      ink.setStrokeWidth(4 / scale);
      ink.setStrokeCap(StrokeCap.Round);
      canvas.save();
      canvas.translate(x, y);
      canvas.scale(scale, scale);
      canvas.drawPath(path, ink);
      canvas.restore();
    } else {
      canvas.drawText(signer.name, x, y + SIGN.h * 0.7, ink, hand);
    }
    x += SIGN.w + SIGN.gap;
  }

  surface.flush();
  const bytes = surface.makeImageSnapshot().encodeToBytes();
  if (bytes === null) throw new Error('memory card: the image did not encode');
  return bytes;
}
