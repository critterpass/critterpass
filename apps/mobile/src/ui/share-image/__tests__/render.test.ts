import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import { loadImage } from '@napi-rs/canvas';
import type { CardLayout, ShareSkiaEngine } from '@cp/critter-art/share';
import { card, frame, image, rect, text } from '@cp/critter-art/share';
import { tokens } from '@cp/design-tokens';
import CanvasKitInit from 'canvaskit-wasm';
import type {
  CanvasKit,
  EmbindEnumEntity,
  Font as CkFont,
  Rect as CkRect,
  Typeface as CkTypeface,
} from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from '@jest/globals';
import type { SkFont, SkRRect, SkRect, SkTypeface } from '@shopify/react-native-skia';

import { renderShareImage } from '../render';

// canvaskit-wasm's Emscripten glue decodes some internal strings as "utf-16le"; jest-expo's
// TextDecoder polyfill only supports UTF-8 (see sticker/__tests__/export-png.test.ts for the same fix).
Object.assign(globalThis, { TextDecoder, TextEncoder });

const nodeRequire = require;

function wrapPaint(ck: CanvasKit) {
  const paint = new ck.Paint();
  const paintStyles = [ck.PaintStyle.Fill, ck.PaintStyle.Stroke];
  const realSetStyle = paint.setStyle.bind(paint);
  Object.assign(paint, {
    setStyle: (v: number) => realSetStyle(paintStyles[v] ?? ck.PaintStyle.Fill),
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
  const blendModes = new Map<number, EmbindEnumEntity>([[3, ck.BlendMode.SrcOver]]);
  return {
    Path: {
      MakeFromCmds: (cmds: number[][]) =>
        ck.Path.MakeFromCmds(cmds.flat()) as unknown as ReturnType<
          ShareSkiaEngine['Path']['MakeFromCmds']
        >,
    },
    Paint: () => {
      const paint = wrapPaint(ck);
      const realSetBlendMode = paint.setBlendMode.bind(paint);
      Object.assign(paint, {
        setBlendMode: (v: number) => realSetBlendMode(blendModes.get(v) ?? ck.BlendMode.SrcOver),
      });
      return paint as unknown as ReturnType<ShareSkiaEngine['Paint']>;
    },
    PictureRecorder: () =>
      wrapPictureRecorder(ck) as unknown as ReturnType<ShareSkiaEngine['PictureRecorder']>,
    Surface: {
      MakeOffscreen: (w: number, h: number) =>
        ck.MakeSurface(w, h) as unknown as ReturnType<ShareSkiaEngine['Surface']['MakeOffscreen']>,
    },
    ImageFilter: {
      MakeDropShadow: (dx, dy, sx, sy, color) =>
        ck.ImageFilter.MakeDropShadow(dx, dy, sx, sy, color, null) as unknown as ReturnType<
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
      return ckFont.getGlyphWidths(ckFont.getGlyphIDs(value)).reduce((sum, w) => sum + w, 0);
    },
    Typeface: {
      MakeFreeTypeFaceFromData: (bytes: Uint8Array) =>
        ck.Typeface.MakeFreeTypeFaceFromData(
          bytes.buffer as ArrayBuffer,
        ) as unknown as SkTypeface | null,
    },
    XYWHRect: (x, y, w, h) => ck.XYWHRect(x, y, w, h) as unknown as SkRect,
    RRectXY: (r, rx, ry) => ck.RRectXY(r as unknown as CkRect, rx, ry) as unknown as SkRRect,
  };
}

let engine: ShareSkiaEngine;

beforeAll(async () => {
  const wasmDir = path.dirname(nodeRequire.resolve('canvaskit-wasm/bin/canvaskit.js'));
  const canvasKit = await CanvasKitInit({ locateFile: (file: string) => path.join(wasmDir, file) });
  engine = createCanvasKitEngine(canvasKit);
});

describe('renderShareImage', () => {
  it('loads every image node URI (including nested in a frame) exactly once and renders a card', async () => {
    const layout: CardLayout = card(
      400,
      300,
      [
        rect(0, 0, 400, 300, tokens.color.paper.base),
        image(20, 20, 100, 100, { uri: 'memory://photo-a' }),
        frame(0, 150, 400, 150, [
          image(20, 20, 100, 100, { uri: 'memory://photo-a' }),
          text(0, 0, 200, 'hi', {
            fontFamily: tokens.type.caption.fontFamily,
            color: tokens.color.ink[950],
            fontSize: tokens.type.caption.fontSize as number,
          }),
        ]),
      ],
      tokens.color.paper.base,
    );

    const loaded: string[] = [];
    const fakeImage = engine.Image.MakeImageFromEncoded(new Uint8Array());
    const loadImageMock = (_engine: ShareSkiaEngine, uri: string) => {
      loaded.push(uri);
      return Promise.resolve(fakeImage ?? undefined);
    };

    const result = await renderShareImage(layout, new Map(), { engine, loadImage: loadImageMock });
    expect(loaded).toEqual(['memory://photo-a']);

    const bytes = result.encodeToBytes();
    if (!bytes) throw new Error('expected encoded bytes');
    const decoded = await loadImage(Buffer.from(bytes));
    expect(decoded.width).toBe(400);
    expect(decoded.height).toBe(300);
  });
});
