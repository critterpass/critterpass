/* eslint-disable lingui/no-unlocalized-strings -- Jest-only harness (module paths, cache dirs); never bundled or rendered. */
import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import type { SkiaEngine } from '@cp/critter-art/skia';
import CanvasKitInit from 'canvaskit-wasm';
import type { CanvasKit, EmbindEnumEntity } from 'canvaskit-wasm';

import { DiskLruCache, MemoryLruCache, StickerCache } from '../sticker/cache';
import type { StickerDiskFs } from '../sticker/cache';

/**
 * A real CanvasKit (WASM Skia) engine for suites that render `<Sticker>`: the sticker renderer's
 * Skia computation runs for real, only the on-screen canvas is the Jest stand-in. Enum and bounds
 * adapters mirror the sticker renderer's own suite.
 */
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

export async function createCanvasKitEngine(): Promise<SkiaEngine> {
  // canvaskit-wasm's Emscripten glue decodes some strings as utf-16le; jest-expo's TextDecoder
  // polyfill only does UTF-8.
  Object.assign(globalThis, { TextDecoder, TextEncoder });
  const wasmDir = path.dirname(require.resolve('canvaskit-wasm/bin/canvaskit.js'));
  const ck = await CanvasKitInit({ locateFile: (file: string) => path.join(wasmDir, file) });
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
    Image: {
      MakeImageFromEncoded: (bytes: Uint8Array) =>
        ck.MakeImageFromEncoded(bytes) as unknown as ReturnType<
          SkiaEngine['Image']['MakeImageFromEncoded']
        >,
    },
  };
}

/** An in-memory sticker cache (memory tier + a Map-backed disk tier). */
export function createMemoryStickerCache(): StickerCache {
  const files = new Map<string, Uint8Array>();
  const fs: StickerDiskFs = {
    cacheDirectory: '/cache/',
    exists: (p) => Promise.resolve(files.has(p)),
    readBytes: (p) => Promise.resolve(files.get(p) ?? new Uint8Array()),
    writeBytes: (p, bytes) => {
      files.set(p, bytes);
      return Promise.resolve();
    },
    deleteFile: (p) => {
      files.delete(p);
      return Promise.resolve();
    },
    listFiles: (dir) =>
      Promise.resolve(
        [...files.keys()].filter((p) => p.startsWith(dir)).map((p) => p.slice(dir.length)),
      ),
    statFile: (p) => Promise.resolve({ size: files.get(p)?.byteLength ?? 0, modifiedMs: 0 }),
  };
  return new StickerCache(new MemoryLruCache(1024 * 1024), new DiskLruCache(fs, 1024 * 1024));
}
