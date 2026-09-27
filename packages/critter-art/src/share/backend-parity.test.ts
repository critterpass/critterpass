import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { loadImage } from '@napi-rs/canvas';
import type { SkFont, SkImage, SkRRect, SkRect, SkTypeface } from '@shopify/react-native-skia';
import CanvasKitInit from 'canvaskit-wasm';
import type {
  CanvasKit,
  EmbindEnumEntity,
  Font as CkFont,
  Rect as CkRect,
  Typeface as CkTypeface,
} from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';

import { comparePngBuffers } from '../../golden/diff';
import type { ShareSkiaEngine } from './backend-skia';
import { renderCardSkia } from './backend-skia';
import { renderCardNode } from './backend-node';
import { card, rect, sticker, text } from './layout';

const nodeRequire = createRequire(import.meta.url);

// Same canvaskit-wasm <-> engine adapter pattern as ../backends/skia/render.test.ts, extended with
// this backend's own text/rect primitives.
function wrapPaint(ck: CanvasKit) {
  const paint = new ck.Paint();
  const paintStyles = [ck.PaintStyle.Fill, ck.PaintStyle.Stroke];
  const strokeCaps = [ck.StrokeCap.Butt, ck.StrokeCap.Round];
  const strokeJoins = [ck.StrokeJoin.Miter, ck.StrokeJoin.Round];
  const blendModes = new Map<number, EmbindEnumEntity>([
    [3, ck.BlendMode.SrcOver],
    [24, ck.BlendMode.Multiply],
  ]);
  const realSetStyle = paint.setStyle.bind(paint);
  const realSetBlendMode = paint.setBlendMode.bind(paint);
  const realSetStrokeCap = paint.setStrokeCap.bind(paint);
  const realSetStrokeJoin = paint.setStrokeJoin.bind(paint);
  Object.assign(paint, {
    setStyle: (v: number) => realSetStyle(paintStyles[v] ?? ck.PaintStyle.Fill),
    setBlendMode: (v: number) => realSetBlendMode(blendModes.get(v) ?? ck.BlendMode.SrcOver),
    setStrokeCap: (v: number) => realSetStrokeCap(strokeCaps[v] ?? ck.StrokeCap.Butt),
    setStrokeJoin: (v: number) => realSetStrokeJoin(strokeJoins[v] ?? ck.StrokeJoin.Miter),
  });
  return paint;
}

function wrapPictureRecorder(ck: CanvasKit) {
  const recorder = new ck.PictureRecorder();
  const bounds = ck.LTRBRect(0, 0, 4096, 4096);
  const realBeginRecording = recorder.beginRecording.bind(recorder);
  Object.assign(recorder, { beginRecording: () => realBeginRecording(bounds) });
  return recorder;
}

function createCanvasKitEngine(ck: CanvasKit): ShareSkiaEngine {
  return {
    Path: {
      MakeFromCmds: (cmds: number[][]) =>
        ck.Path.MakeFromCmds(cmds.flat()) as unknown as ReturnType<
          ShareSkiaEngine['Path']['MakeFromCmds']
        >,
    },
    Paint: () => wrapPaint(ck) as unknown as ReturnType<ShareSkiaEngine['Paint']>,
    PictureRecorder: () =>
      wrapPictureRecorder(ck) as unknown as ReturnType<ShareSkiaEngine['PictureRecorder']>,
    Surface: {
      MakeOffscreen: (w: number, h: number) =>
        ck.MakeSurface(w, h) as unknown as ReturnType<ShareSkiaEngine['Surface']['MakeOffscreen']>,
    },
    ImageFilter: {
      MakeDropShadow: (dx, dy, sigmaX, sigmaY, color) =>
        ck.ImageFilter.MakeDropShadow(dx, dy, sigmaX, sigmaY, color, null) as unknown as ReturnType<
          ShareSkiaEngine['ImageFilter']['MakeDropShadow']
        >,
    },
    Color: (color: string) => ck.parseColorString(color),
    Image: {
      MakeImageFromEncoded: (bytes: Uint8Array) =>
        ck.MakeImageFromEncoded(bytes) as unknown as ReturnType<
          ShareSkiaEngine['Image']['MakeImageFromEncoded']
        >,
    },
    Font: (typeface, size) =>
      new ck.Font(typeface as unknown as CkTypeface | null, size) as unknown as SkFont,
    measureText: (font: SkFont, value: string) => {
      const ckFont = font as unknown as CkFont;
      const ids = ckFont.getGlyphIDs(value);
      const widths = ckFont.getGlyphWidths(ids);
      return widths.reduce((sum, w) => sum + w, 0);
    },
    Typeface: {
      MakeFreeTypeFaceFromData: (bytes: Uint8Array) =>
        ck.Typeface.MakeFreeTypeFaceFromData(
          bytes.buffer as ArrayBuffer,
        ) as unknown as SkTypeface | null,
    },
    XYWHRect: (x, y, w, h) => ck.XYWHRect(x, y, w, h) as unknown as SkRect,
    RRectXY: (rect2, rx, ry) =>
      ck.RRectXY(rect2 as unknown as CkRect, rx, ry) as unknown as SkRRect,
  };
}

const FONT_PATH = new URL('../../../../apps/mobile/assets/fonts/Geist-400.ttf', import.meta.url);
const FONT_FAMILY = 'Geist';

// Share cards mix large flat fills (well within the sticker golden's <0.5/255 mean-abs bar) with
// text — text glyphs are shaped/hinted by each engine's own text shaper (canvaskit's vs @napi-rs/
// canvas's), so anti-aliased glyph edges differ by a few intensity levels even from the exact same
// font file and pixel grid. This is the "text AA band" the share renderer documents rather than
// chasing: looser than the sticker golden (art has no text), tight enough to catch a real
// regression (wrong colour, missing node, broken layout).
const SHARE_MEAN_ABS_DIFF_THRESHOLD = 1.0;
const SHARE_PIXELS_OVER_8_PCT_THRESHOLD = 2;

let engine: ShareSkiaEngine;
let fontBytes: Uint8Array;

beforeAll(async () => {
  fontBytes = new Uint8Array(readFileSync(FONT_PATH));

  const wasmDir = path.dirname(nodeRequire.resolve('canvaskit-wasm/bin/canvaskit.js'));
  const canvasKit = await CanvasKitInit({ locateFile: (file: string) => path.join(wasmDir, file) });
  engine = createCanvasKitEngine(canvasKit);
});

describe('share layout: Skia vs Node backend parity', () => {
  it('renders a representative card within share tolerance on both backends', async () => {
    const layout = card(
      1080,
      1350,
      [
        rect(0, 0, 1080, 1350, '#f4efe4'),
        rect(60, 60, 960, 200, '#3a3466', { radius: 24, halftone: true }),
        text(90, 100, 900, 'Tokek found you in Bali', {
          fontFamily: FONT_FAMILY,
          fontWeight: 400,
          color: '#ffffff',
          fontSize: 48,
        }),
        sticker(440, 500, 200, { kind: 'gecko', seed: 7 }),
      ],
      '#f4efe4',
    );

    const typefaces = new Map<string, SkTypeface>();
    const typeface = engine.Typeface.MakeFreeTypeFaceFromData(fontBytes);
    if (typeface) typefaces.set(FONT_FAMILY, typeface);

    const skiaImage: SkImage = renderCardSkia(layout, engine, typefaces, new Map());
    const skiaBytes = skiaImage.encodeToBytes();
    if (!skiaBytes) throw new Error('renderCardSkia produced no bytes');

    // The Node backend registers its own copy of the same font file into @napi-rs/canvas's global
    // font table exactly once per process.
    const { registerFonts } = await import('./backend-node');
    registerFonts([{ family: FONT_FAMILY, bytes: fontBytes }]);
    const nodeBytes = await renderCardNode(layout);

    const diff = await comparePngBuffers(Buffer.from(nodeBytes), Buffer.from(skiaBytes));
    expect(
      diff.meanAbsDiff < SHARE_MEAN_ABS_DIFF_THRESHOLD &&
        diff.pctPixelsOver8 < SHARE_PIXELS_OVER_8_PCT_THRESHOLD,
      `meanAbsDiff=${diff.meanAbsDiff.toFixed(3)} pctOver8=${diff.pctPixelsOver8.toFixed(3)}%`,
    ).toBe(true);

    const decoded = await loadImage(Buffer.from(nodeBytes));
    expect(decoded.width).toBe(1080);
    expect(decoded.height).toBe(1350);
  });
});
