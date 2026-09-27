/**
 * @jest-environment node
 *
 * jest-expo's setup files install an Expo `TextDecoder` polyfill that only supports UTF-8
 * regardless of `testEnvironment` (it runs before this file's own code); canvaskit-wasm's
 * Emscripten glue decodes some internal strings as "utf-16le" during init, so this file restores
 * Node's native `TextDecoder`/`TextEncoder` before initializing CanvasKit — it needs nothing else
 * from jest-expo (no React Native rendering).
 */
import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import { loadImage } from '@napi-rs/canvas';
import type { SkiaEngine } from '@cp/critter-art/skia';
import CanvasKitInit from 'canvaskit-wasm';
import type { CanvasKit, EmbindEnumEntity } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from '@jest/globals';

import { exportPng } from '../export-png';

Object.assign(globalThis, { TextDecoder, TextEncoder });

// Jest transpiles this file to CommonJS (`import.meta.url` is unavailable there), but it still
// provides the CJS `require` global, so resolve canvaskit's WASM binary path through that instead.
declare const require: { resolve: (id: string) => string };

// Same canvaskit-wasm <-> SkiaEngine adapter as packages/critter-art/src/backends/skia/render.test.ts
// (duplicated rather than exported from critter-art's public surface, which stays production-only).
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

function createCanvasKitEngine(ck: CanvasKit): SkiaEngine {
  return {
    Path: {
      MakeFromCmds: (cmds: number[][]) =>
        ck.Path.MakeFromCmds(cmds.flat()) as unknown as ReturnType<
          SkiaEngine['Path']['MakeFromCmds']
        >,
    },
    Paint: () => wrapPaint(ck) as unknown as ReturnType<SkiaEngine['Paint']>,
    PictureRecorder: () =>
      wrapPictureRecorder(ck) as unknown as ReturnType<SkiaEngine['PictureRecorder']>,
    Surface: {
      MakeOffscreen: (w: number, h: number) =>
        ck.MakeSurface(w, h) as unknown as ReturnType<SkiaEngine['Surface']['MakeOffscreen']>,
    },
    ImageFilter: {
      MakeDropShadow: (dx, dy, sigmaX, sigmaY, color) =>
        ck.ImageFilter.MakeDropShadow(dx, dy, sigmaX, sigmaY, color, null) as unknown as ReturnType<
          SkiaEngine['ImageFilter']['MakeDropShadow']
        >,
    },
    Color: (color: string) => ck.parseColorString(color),
  };
}

let engine: SkiaEngine;

beforeAll(async () => {
  const wasmDir = path.dirname(require.resolve('canvaskit-wasm/bin/canvaskit.js'));
  const canvasKit = await CanvasKitInit({ locateFile: (file: string) => path.join(wasmDir, file) });
  engine = createCanvasKitEngine(canvasKit);
});

describe('exportPng', () => {
  it('writes a decodable PNG at the expected pixel size', async () => {
    const written: { path: string; bytes: Uint8Array }[] = [];
    await exportPng({ kind: 'gecko', seed: 7 }, 96, 2, '/tmp/gecko.png', {
      engine,
      writeBytes: (p, bytes) => {
        written.push({ path: p, bytes });
        return Promise.resolve();
      },
    });

    expect(written).toHaveLength(1);
    expect(written[0]?.path).toBe('/tmp/gecko.png');
    const image = await loadImage(Buffer.from(written[0]!.bytes));
    expect(image.width).toBe(192); // 96pt * 2x device scale
    expect(image.height).toBeGreaterThan(0);
  });
});
