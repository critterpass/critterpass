import { createCanvas } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';

import { frame } from '../../core/frame';
import { layout } from '../../core/layout';
import { build } from '../../core/model';
import type { KindDrawOptions } from '../../kinds/registry';
import { registerKind } from '../../kinds/registry';
import type { OpSink } from '../../core/ops';
import { renderToCanvas, viewportFor } from './index';
import type { Canvas2DContext, CanvasFactory, CanvasLike } from './render';

const RECORDING_KIND = 'canvas2d-test-recording';
const NODE_CANVAS_KIND = 'canvas2d-test-node-canvas';

function twoToneSquareKind(sink: OpSink, options: KindDrawOptions): void {
  sink.wash(
    [
      [10, 10],
      [90, 10],
      [90, 90],
      [10, 90],
    ],
    options.fill ?? '#a9d08c',
  );
  sink.fill(
    [
      [30, 30],
      [70, 30],
      [70, 70],
      [30, 70],
    ],
    options.accent ?? '#ff5fa8',
  );
}

beforeAll(() => {
  registerKind(RECORDING_KIND, { fn: twoToneSquareKind, viewBox: [100, 100], animates: false });
  registerKind(NODE_CANVAS_KIND, { fn: twoToneSquareKind, viewBox: [100, 100], animates: false });
});

interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

interface RecordedPaint {
  readonly op: 'fill' | 'stroke';
  readonly compositeOperation: string;
  readonly alpha: number;
  readonly style: string;
}

/** A canvas2d-shaped recorder: precise, allocation-free assertions without a real rasterizer. */
function createRecordingCanvas(
  width: number,
  height: number,
): { canvas: CanvasLike; calls: RecordedCall[]; paints: RecordedPaint[] } {
  const calls: RecordedCall[] = [];
  const paints: RecordedPaint[] = [];
  const record = (method: string, ...args: unknown[]): void => {
    calls.push({ method, args });
  };
  const ctx: Canvas2DContext = {
    save: () => record('save'),
    restore: () => record('restore'),
    beginPath: () => record('beginPath'),
    moveTo: (x, y) => record('moveTo', x, y),
    lineTo: (x, y) => record('lineTo', x, y),
    closePath: () => record('closePath'),
    fill: () => {
      record('fill');
      paints.push({
        op: 'fill',
        compositeOperation: ctx.globalCompositeOperation,
        alpha: ctx.globalAlpha,
        style: ctx.fillStyle,
      });
    },
    stroke: () => {
      record('stroke');
      paints.push({
        op: 'stroke',
        compositeOperation: ctx.globalCompositeOperation,
        alpha: ctx.globalAlpha,
        style: ctx.strokeStyle,
      });
    },
    clearRect: (x, y, w, h) => record('clearRect', x, y, w, h),
    setTransform: (a, b, c, d, e, f) => record('setTransform', a, b, c, d, e, f),
    drawImage: (image, dx, dy) => record('drawImage', image, dx, dy),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetY: 0,
  };
  const canvas: CanvasLike = { width, height, getContext: () => ctx };
  return { canvas, calls, paints };
}

describe('renderToCanvas', () => {
  it('clears the main canvas, then draws the isolated body layer to its own offscreen canvas', () => {
    // `frame` always wraps its output in one outer isolating layer (design's washes only ever
    // multiply against their own sticker/washes) — so the main canvas only clears and composites
    // a single drawImage, while the layer's own content lands on its offscreen canvas.
    const canvases: RecordedCall[][] = [];
    const factory: CanvasFactory = (w, h) => {
      const { canvas, calls } = createRecordingCanvas(w, h);
      canvases.push(calls);
      return canvas;
    };
    const model = build({ kind: RECORDING_KIND, seed: 7 }, 96);
    const boxLayout = layout({ kind: RECORDING_KIND, seed: 7 }, 96);
    const viewport = viewportFor(boxLayout, 2);
    renderToCanvas(frame(model, 1), viewport, factory);

    expect(canvases).toHaveLength(2);
    const [main, outerLayer] = canvases as [RecordedCall[], RecordedCall[]];
    expect(main.some((c) => c.method === 'clearRect')).toBe(true);
    expect(main.some((c) => c.method === 'drawImage')).toBe(true);
    expect(main.some((c) => c.method === 'fill')).toBe(false);

    const setTransformCalls = outerLayer.filter((c) => c.method === 'setTransform');
    expect(setTransformCalls[0]?.args).toEqual([
      viewport.contentScale,
      0,
      0,
      viewport.contentScale,
      viewport.padPx,
      viewport.padPx,
    ]);
    expect(outerLayer.some((c) => c.method === 'fill')).toBe(true);
  });

  it('maps blend modes to composite operations: multiply for the wash, source-over for the fill', () => {
    let paints: RecordedPaint[] = [];
    const factory: CanvasFactory = (w, h) => {
      const recording = createRecordingCanvas(w, h);
      paints = recording.paints;
      return recording.canvas;
    };
    const model = build({ kind: RECORDING_KIND, seed: 7 }, 96);
    const boxLayout = layout({ kind: RECORDING_KIND, seed: 7 }, 96);
    renderToCanvas(frame(model, 1), viewportFor(boxLayout, 1), factory);

    const fillPaints = paints.filter((paint) => paint.op === 'fill');
    // Pass 1 (wash fill) multiplies; pass 2 (fill op) is source-over.
    expect(fillPaints[0]?.compositeOperation).toBe('multiply');
    expect(fillPaints.at(-1)?.compositeOperation).toBe('source-over');
    expect(fillPaints.at(-1)?.style).toBe('#ff5fa8');
  });

  it('draws a nested, shadowed sticker sub-layer via drawImage into a same-size offscreen canvas', () => {
    let main: RecordedCall[] = [];
    const offscreenSizes: Array<{ w: number; h: number }> = [];
    const factory: CanvasFactory = (w, h) => {
      offscreenSizes.push({ w, h });
      const recording = createRecordingCanvas(w, h);
      if (offscreenSizes.length === 1) main = recording.calls;
      return recording.canvas;
    };
    const spec = { kind: RECORDING_KIND, seed: 7, sticker: { color: '#f4efe4' } };
    const model = build(spec, 96);
    const boxLayout = layout(spec, 96);
    const viewport = viewportFor(boxLayout, 1);
    renderToCanvas(frame(model, 1), viewport, factory);

    // Main canvas + the outer isolating layer's offscreen + the nested sticker sub-layer's
    // offscreen, all at the same pixel size (layers never change the viewport).
    expect(offscreenSizes).toHaveLength(3);
    for (const size of offscreenSizes) {
      expect(size).toEqual({ w: viewport.widthPx, h: viewport.heightPx });
    }
    expect(main.some((c) => c.method === 'drawImage')).toBe(true);
  });
});

describe('renderToCanvas with @napi-rs/canvas', () => {
  it('rasterizes a hand-written kind to real, non-transparent pixels in Node', () => {
    // @napi-rs/canvas implements the same Canvas2D surface (Skia); adapt its factory shape once here.
    const factory = ((w: number, h: number) => createCanvas(w, h)) as unknown as CanvasFactory;
    const spec = { kind: NODE_CANVAS_KIND, seed: 7, sticker: { color: '#f4efe4' } };
    const model = build(spec, 96);
    const boxLayout = layout(spec, 96);
    const viewport = viewportFor(boxLayout, 2);
    const canvas = renderToCanvas(frame(model, 1), viewport, factory) as unknown as ReturnType<
      typeof createCanvas
    >;

    expect(canvas.width).toBe(viewport.widthPx);
    expect(canvas.height).toBe(viewport.heightPx);
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let opaquePixels = 0;
    for (let i = 3; i < data.length; i += 4) {
      const alpha = data[i];
      if (alpha !== undefined && alpha > 0) opaquePixels++;
    }
    expect(opaquePixels).toBeGreaterThan(0);
  });
});
