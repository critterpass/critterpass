// Node reference renderer: implements DrawSurface over @napi-rs/canvas (a real Skia binding, the
// same rendering engine as @shopify/react-native-skia — just hosted in Node instead of on-device),
// so this is a legitimate stand-in for on-device output, not merely a convenient mock.
import { createCanvas } from '@napi-rs/canvas';
import type { SKRSContext2D } from '@napi-rs/canvas';

import { renderGeckoFrame } from './draw-surface';
import type { BlendMode, DrawSurface } from './draw-surface';
import { buildGeckoDrawing } from './gecko-ops';
import type { GeckoPalette } from './gecko-ops';
import type { Point } from './geometry';

/** Callers (fillPolygon/strokePolygon) already guard `points.length >= 2` before tracing. */
function firstPoint(points: readonly Point[]): Point {
  const point = points[0];
  if (!point) throw new Error('node-canvas-surface: cannot trace an empty polygon');
  return point;
}

function tracePolygon(ctx: SKRSContext2D, points: readonly Point[]): void {
  const [x0, y0] = firstPoint(points);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    if (!point) continue;
    ctx.lineTo(point[0], point[1]);
  }
  ctx.closePath();
}

// @napi-rs/canvas declares `GlobalCompositeOperation` without exporting it, so this mirrors the two
// literal members this module actually uses instead of importing a type the package does not expose.
function toCompositeOperation(blend: BlendMode | undefined): 'multiply' | 'source-over' {
  return blend === 'multiply' ? 'multiply' : 'source-over';
}

export function createNodeCanvasSurface(ctx: SKRSContext2D): DrawSurface {
  return {
    fillPolygon(points, color, alpha, blend) {
      if (points.length < 2 || alpha <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = toCompositeOperation(blend);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      tracePolygon(ctx, points);
      ctx.fill();
      ctx.restore();
    },
    strokePolygon(points, color, width, alpha) {
      if (points.length < 2 || alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      tracePolygon(ctx, points);
      ctx.stroke();
      ctx.restore();
    },
    translated(dx, dy, draw) {
      ctx.save();
      ctx.translate(dx, dy);
      draw();
      ctx.restore();
    },
  };
}

export interface RenderGeckoOptions {
  readonly size?: number;
  readonly progress?: number;
  readonly palette?: GeckoPalette;
}

/** Gecko's design/doodles.js viewBox is a fixed 0..100 square (no sticker padding used here). */
const VIEW_BOX = 100;

/** Renders Tokek to a PNG buffer via the Node canvas surface — the spike's "Node prerender". */
export function renderGeckoToPng(options: RenderGeckoOptions = {}): { png: Buffer; renderMs: number } {
  const size = options.size ?? 200;
  const progress = options.progress ?? 1;
  const { ops, totalLineLength } = buildGeckoDrawing(options.palette);

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.scale(size / VIEW_BOX, size / VIEW_BOX);

  const surface = createNodeCanvasSurface(ctx);
  const start = performance.now();
  renderGeckoFrame(surface, ops, totalLineLength, progress);
  const renderMs = performance.now() - start;

  return { png: canvas.toBuffer('image/png'), renderMs };
}
