// Builds real @shopify/react-native-skia SkPath objects from a gecko drawing at a given progress —
// the on-device half of the "Canvas2D-like interface over Skia" this spike ports the design's brush
// maths onto (tools/spikes/src/skia-critter mirrors this for the Node prerender). Re-tessellates
// every ribbon on every call by design: that per-frame cost is what the spike measures. Not a
// route — see the default export at the bottom.
import { Skia } from '@shopify/react-native-skia';
import type { SkPath, SkPoint } from '@shopify/react-native-skia';

import { buildRibbonPolygon } from './critter-geometry';
import type { Point } from './critter-geometry';
import type { DrawOp } from './critter-draw-ops';

/** <Path blendMode> takes the DOM API's camelCase string form of Skia's BlendMode enum, not the enum itself. */
export type PaintBlendMode = 'srcOver' | 'multiply';

export interface GeckoPaintOp {
  readonly path: SkPath;
  readonly color: string;
  readonly opacity: number;
  /** Always a definite mode — exactOptionalPropertyTypes rejects passing `undefined` through to <Path blendMode>. */
  readonly blendMode: PaintBlendMode;
}

function toSkPoints(points: readonly Point[]): SkPoint[] {
  return points.map(([x, y]) => ({ x, y }));
}

function polygonPath(points: readonly Point[]): SkPath {
  const path = Skia.Path.Make();
  path.addPoly(toSkPoints(points), true);
  return path;
}

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined)
    throw new Error(`critter-skia-paint: index ${index} out of range (length ${items.length})`);
  return value;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const UNDER_AMP = 0.3;
const LINE_AMP = 0.45;
const MIN_STROKE_WIDTH = 1.05;

// Ported from tools/spikes/src/skia-critter/geometry.ts's seededRng — kept local so this module
// stays a single, self-contained on-device paint-op builder.
function seededRng(seed: number): () => number {
  let a = (seed * 1000003) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds the ordered list of filled paths for one frame at `progress` (0..1), ported from
 * doodles.js `draw(p)`: washes/underlays first, then fills and ink lines with a stroke-length
 * draw-on budget. Call again every animation frame to reproduce the on-screen cost of NOT caching
 * a critter's paint — see critter.tsx / critterdex-grid.tsx for the cached-image alternative.
 */
export function buildGeckoPaintOps(
  ops: readonly DrawOp[],
  totalLineLength: number,
  progress: number,
): GeckoPaintOp[] {
  const p = clamp01(progress);
  if (p <= 0) return [];
  const fadeAlpha = clamp01((p - 0.25) / 0.55);
  const result: GeckoPaintOp[] = [];

  for (const op of ops) {
    if (op.kind === 'wash') {
      const random = seededRng(op.seed);
      const ox = (random() - 0.5) * 2 * op.offset;
      const oy = (random() - 0.2) * op.offset;
      const shifted = op.points.map(([x, y]) => [x + ox, y + oy] as Point);
      result.push({
        path: polygonPath(shifted),
        color: op.color,
        opacity: op.alpha * fadeAlpha,
        blendMode: 'multiply',
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
      result.push({
        path: polygonPath(polygon),
        color: op.color,
        opacity: 0.9 * fadeAlpha,
        blendMode: 'multiply',
      });
    }
  }

  let budget = p * totalLineLength * 1.02;
  for (const op of ops) {
    if (op.kind === 'fill') {
      result.push({
        path: polygonPath(op.points),
        color: op.color,
        opacity: op.alpha * (p >= 1 ? 1 : fadeAlpha),
        blendMode: 'srcOver',
      });
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
      result.push({
        path: polygonPath(polygon),
        color: op.color,
        opacity: 1,
        blendMode: 'srcOver',
      });
    }
  }
  return result;
}

// See critter-geometry.ts's header: not a screen, only a paint helper living next to route files.
export default {};
