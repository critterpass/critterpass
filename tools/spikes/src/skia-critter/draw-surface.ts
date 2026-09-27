// Shared render loop over a minimal Canvas2D-like surface, ported from design/doodles.js
// `DoodleArt.draw(p)`. Both the Node reference renderer (node-canvas-surface.ts, @napi-rs/canvas)
// and the on-device renderer (apps/mobile's critter spike screen, @shopify/react-native-skia)
// implement `DrawSurface` against this same op list — this is the "Canvas2D-like interface over
// Skia" the spike measures draw-on cost through.
import { buildRibbonPolygon, seededRng } from './geometry';
import type { Point } from './geometry';
import type { DrawOp } from './gecko-ops';

export type BlendMode = 'normal' | 'multiply';

export interface DrawSurface {
  fillPolygon(points: readonly Point[], color: string, alpha: number, blend?: BlendMode): void;
  strokePolygon(points: readonly Point[], color: string, width: number, alpha: number): void;
  /** Runs `draw` with the surface's origin shifted by (dx, dy); used for the watercolour wash jitter. */
  translated(dx: number, dy: number, draw: () => void): void;
}

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined)
    throw new Error(`draw-surface: index ${index} out of range (length ${items.length})`);
  return value;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const UNDER_AMP = 0.3;
const LINE_AMP = 0.45;
const MIN_STROKE_WIDTH = 1.05;

/**
 * Renders one frame of a gecko drawing at `progress` (0 = nothing drawn, 1 = fully drawn), ported
 * from doodles.js `draw(p)`: washes/underlays first, then fills and ink lines with a stroke-length
 * "draw-on" budget. Re-tessellates every ribbon on every call by design — that per-frame cost is
 * exactly what this spike is measuring for concurrent critters and Critterdex scrolling.
 */
export function renderGeckoFrame(
  surface: DrawSurface,
  ops: readonly DrawOp[],
  totalLineLength: number,
  progress: number,
): void {
  const p = clamp01(progress);
  if (p <= 0) return;
  const fadeAlpha = clamp01((p - 0.25) / 0.55);

  for (const op of ops) {
    if (op.kind === 'wash') {
      const random = seededRng(op.seed);
      const ox = (random() - 0.5) * 2 * op.offset;
      const oy = (random() - 0.2) * op.offset;
      surface.translated(ox, oy, () => {
        surface.fillPolygon(op.points, op.color, op.alpha * fadeAlpha, 'multiply');
        surface.strokePolygon(op.points, op.color, 1.4, 0.28 * fadeAlpha);
      });
    } else if (op.kind === 'under') {
      const polygon = buildRibbonPolygon(op.points, op.points.length, {
        w: op.width,
        minW: MIN_STROKE_WIDTH,
        taper: true,
        close: false,
        seed: op.seed,
        amp: UNDER_AMP,
      });
      surface.fillPolygon(polygon, op.color, 0.9 * fadeAlpha, 'multiply');
    }
  }

  let budget = p * totalLineLength * 1.02;
  for (const op of ops) {
    if (op.kind === 'fill') {
      surface.fillPolygon(op.points, op.color, op.alpha * (p >= 1 ? 1 : fadeAlpha));
    } else if (op.kind === 'line') {
      if (budget <= 0) continue;
      let points = op.points;
      if (budget < op.length) {
        let travelled = 0;
        let cut = 1;
        for (; cut < points.length; cut += 1) {
          const a = at(points, cut - 1);
          const b = at(points, cut);
          travelled += Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (travelled > budget) break;
        }
        points = points.slice(0, cut + 1);
      }
      budget -= op.length;
      const polygon = buildRibbonPolygon(points, op.points.length, {
        w: op.width,
        minW: MIN_STROKE_WIDTH,
        taper: op.taper,
        close: op.close,
        seed: op.seed,
        amp: LINE_AMP,
      });
      surface.fillPolygon(polygon, op.color, 1);
    }
  }
}
