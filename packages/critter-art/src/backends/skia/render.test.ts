import { createRequire } from 'node:module';
import path from 'node:path';

import { createCanvas } from '@napi-rs/canvas';
import type { Canvas } from '@napi-rs/canvas';
import type {
  SkCanvas,
  SkImage,
  SkImageFilter,
  SkPaint,
  SkPath,
  SkPictureRecorder,
  SkSurface,
} from '@shopify/react-native-skia';
import CanvasKitInit from 'canvaskit-wasm';
import type { CanvasKit, EmbindEnumEntity } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';

import { GUIDE_KINDS, ICON_KINDS } from '../../../golden/cases';
import { comparePngBuffers, isWithinThreshold } from '../../../golden/diff';
import { frame } from '../../core/frame';
import { layout } from '../../core/layout';
import { build, CLEAR_FILL } from '../../core/model';
import type { RenderSpec } from '../../core/model';
import { renderToCanvas, viewportFor as canvas2dViewportFor } from '../canvas2d';
import type { CanvasFactory } from '../canvas2d';
import { viewportFor as skiaViewportFor } from './index';
import type { SkiaEngine } from './render';
import { renderToPicture, toImage } from './render';

const nodeRequire = createRequire(import.meta.url);

/**
 * Returns a real canvaskit `Paint` instance with its `setStyle`/`setBlendMode`/`setStrokeCap`/
 * `setStrokeJoin` own-properties overridden to accept this backend's plain-number values (matching
 * `@shopify/react-native-skia`'s numeric enums) and translate them to canvaskit's Embind enum
 * objects before delegating to the real (bound) method. The object's identity and prototype are
 * untouched, so `canvas.drawPath(path, paint)` still receives a genuine Embind `Paint` — a plain
 * lookalike object fails canvaskit's native type check ("Cannot pass [object Object] as a Paint").
 */
function wrapPaint(ck: CanvasKit): SkPaint {
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

  return paint as unknown as SkPaint;
}

/** Returns a real canvaskit `PictureRecorder` with `beginRecording` overridden to supply the explicit cull bounds canvaskit requires (unlike react-native-skia's optional one) — same identity-preserving pattern as `wrapPaint`. */
function wrapPictureRecorder(ck: CanvasKit): SkPictureRecorder {
  const recorder = new ck.PictureRecorder();
  const bounds = ck.LTRBRect(0, 0, 4096, 4096);
  const realBeginRecording = recorder.beginRecording.bind(recorder);

  Object.assign(recorder, {
    beginRecording: () => realBeginRecording(bounds) as unknown as SkCanvas,
  });

  return recorder as unknown as SkPictureRecorder;
}

/**
 * Adapts `canvaskit-wasm` (the WASM build of the same Skia engine `@shopify/react-native-skia`
 * uses natively) to this backend's minimal `SkiaEngine` interface. This lets `render.ts` be
 * exercised against a real Skia rasterizer here in Node/Vitest — there is no way to load the
 * native RN Skia JSI binding outside a React Native runtime.
 */
function createCanvasKitEngine(ck: CanvasKit): SkiaEngine {
  return {
    Path: {
      MakeFromCmds: (cmds: number[][]) =>
        ck.Path.MakeFromCmds(cmds.flat()) as unknown as SkPath | null,
    },
    Paint: () => wrapPaint(ck),
    PictureRecorder: () => wrapPictureRecorder(ck),
    Surface: {
      MakeOffscreen: (width: number, height: number) =>
        ck.MakeSurface(width, height) as unknown as SkSurface | null,
    },
    ImageFilter: {
      MakeDropShadow: (dx, dy, sigmaX, sigmaY, color) =>
        ck.ImageFilter.MakeDropShadow(
          dx,
          dy,
          sigmaX,
          sigmaY,
          color,
          null,
        ) as unknown as SkImageFilter,
    },
    Color: (color: string) => ck.parseColorString(color),
    Image: {
      MakeImageFromEncoded: (bytes: Uint8Array) =>
        ck.MakeImageFromEncoded(bytes) as unknown as SkImage | null,
    },
  };
}

const SAMPLE_KINDS = [...GUIDE_KINDS, ...ICON_KINDS.slice(0, 14)];
const SIZE_PT = 96;
const DEVICE_SCALE = 2;
const SEED = 7;

let engine: SkiaEngine;

beforeAll(async () => {
  const wasmDir = path.dirname(nodeRequire.resolve('canvaskit-wasm/bin/canvaskit.js'));
  const canvasKit = await CanvasKitInit({ locateFile: (file: string) => path.join(wasmDir, file) });
  engine = createCanvasKitEngine(canvasKit);
});

async function renderBothBackends(spec: RenderSpec): Promise<{
  readonly canvas2dPng: Buffer;
  readonly skiaPng: Buffer;
  readonly effectiveSizePt: number;
}> {
  const model = build(spec, SIZE_PT);
  const boxLayout = layout(spec, SIZE_PT);
  const cmds = frame(model, 1);

  const canvas2dViewport = canvas2dViewportFor(boxLayout, DEVICE_SCALE);
  const factory = ((w: number, h: number) => createCanvas(w, h)) as unknown as CanvasFactory;
  const canvas = renderToCanvas(cmds, canvas2dViewport, factory) as unknown as Canvas;
  const canvas2dPng = await canvas.encode('png');

  const viewport = skiaViewportFor(boxLayout, DEVICE_SCALE);
  const picture = renderToPicture(cmds, viewport, engine);
  const image = toImage(engine, picture, viewport.widthPx, viewport.heightPx);
  const skiaBytes = image.encodeToBytes();
  if (!skiaBytes) throw new Error(`${spec.kind}: SkImage.encodeToBytes returned null`);

  return {
    canvas2dPng,
    skiaPng: Buffer.from(skiaBytes),
    effectiveSizePt: Math.min(boxLayout.w, boxLayout.h),
  };
}

describe('Skia backend vs canvas2d backend (real Skia via canvaskit-wasm)', () => {
  it.each(SAMPLE_KINDS)('renders %s within golden thresholds', async (kind) => {
    const { canvas2dPng, skiaPng, effectiveSizePt } = await renderBothBackends({
      kind,
      seed: SEED,
    });
    const diff = await comparePngBuffers(canvas2dPng, skiaPng);
    expect(
      isWithinThreshold(diff, effectiveSizePt),
      `${kind}: meanAbsDiff=${diff.meanAbsDiff.toFixed(3)} pctOver8=${diff.pctPixelsOver8.toFixed(3)}%`,
    ).toBe(true);
  });

  it('keeps a clear fill clear, as canvas does (the tab bar egg drawn as an outline)', async () => {
    const ink = '#8d87a8';
    const { canvas2dPng, skiaPng, effectiveSizePt } = await renderBothBackends({
      kind: 'egg',
      seed: SEED,
      sticker: null,
      variant: 'color',
      blend: 'srcOver',
      form: {
        rarity: 'common',
        edge: 'none',
        palette: { ink, f: CLEAR_FILL, dk: ink, bl: CLEAR_FILL },
      },
    });
    const diff = await comparePngBuffers(canvas2dPng, skiaPng);
    expect(
      isWithinThreshold(diff, effectiveSizePt),
      `clear egg: meanAbsDiff=${diff.meanAbsDiff.toFixed(3)} pctOver8=${diff.pctPixelsOver8.toFixed(3)}%`,
    ).toBe(true);
  });

  it('renders the sticker + shadow layer within golden thresholds', async () => {
    const { canvas2dPng, skiaPng, effectiveSizePt } = await renderBothBackends({
      kind: 'gecko',
      seed: SEED,
      sticker: { color: '#f4efe4' },
    });
    const diff = await comparePngBuffers(canvas2dPng, skiaPng);
    expect(
      isWithinThreshold(diff, effectiveSizePt),
      `sticker: meanAbsDiff=${diff.meanAbsDiff.toFixed(3)} pctOver8=${diff.pctPixelsOver8.toFixed(3)}%`,
    ).toBe(true);
  });
});
