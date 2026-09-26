import { createRng } from './rng';
import { type Point, pointAt } from './geometry';

export interface RibbonOptions {
  /** Per-op seed; combined with a fresh `createRng` call, never shared across ribbons. */
  readonly seed: number;
  /** Wobble amplitude in local units (line/under ops use different amounts). */
  readonly amp: number;
  /** Base stroke width in local units before pressure/taper shaping. */
  readonly w: number;
  /** Minimum half-width floor so strokes never vanish at small render sizes. */
  readonly minW: number;
  /** Closed strokes (spots, tails) pulse width with a sine wave instead of tapering. */
  readonly close: boolean;
  /** Open, untapered strokes (e.g. limbs) hold full width instead of easing to a point. */
  readonly taper: boolean;
}

export interface RibbonPolygon {
  readonly left: Point[];
  readonly right: Point[];
}

/**
 * Variable-width brush ribbon, ported bit-for-bit from design/doodles.js `ribbon` — minus the
 * canvas calls, which the backend issues from `ribbonOutline`'s flattened polygon. Wobble
 * frequency is keyed to point *index*, so `points` must already be the exact tessellation the
 * design would draw; never re-tessellate before calling this.
 */
export function ribbonPolygon(
  points: readonly Point[],
  fullPointCount: number,
  options: RibbonOptions,
): RibbonPolygon {
  const n = points.length;
  if (n < 2) return { left: [], right: [] };
  const random = createRng(options.seed);
  const phase1 = random() * 6.28;
  const phase2 = random() * 6.28;
  const wobbled: Point[] = points.map(
    (p, i): Point => [
      p[0] + Math.sin(i * 0.07 + phase1) * options.amp,
      p[1] + Math.cos(i * 0.061 + phase2) * options.amp,
    ],
  );
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = pointAt(wobbled, Math.max(0, i - 1));
    const b = pointAt(wobbled, Math.min(n - 1, i + 1));
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    const nx = -dy / m;
    const ny = dx / m;
    const t = i / Math.max(1, fullPointCount - 1);
    const press = options.close
      ? 0.78 + 0.22 * Math.sin(t * 6.28 * 2 + phase1)
      : options.taper
        ? Math.pow(Math.max(0.02, Math.sin(Math.PI * (0.06 + 0.88 * t))), 0.5)
        : 1;
    const halfWidth =
      Math.max(options.minW, options.w * press * (0.9 + 0.2 * Math.sin(i * 0.19 + phase2))) / 2;
    const point = pointAt(wobbled, i);
    left.push([point[0] + nx * halfWidth, point[1] + ny * halfWidth]);
    right.push([point[0] - nx * halfWidth, point[1] - ny * halfWidth]);
  }
  return { left, right };
}

/**
 * Flattens a ribbon into the closed fill polygon the design composites: left edge forward, then
 * the right edge backward (`beginPath/moveTo(L[0])/lineTo(L[1..])/lineTo(R[n-1..0])/closePath`).
 */
export function ribbonOutline(ribbon: RibbonPolygon): Point[] {
  return ribbon.left.concat(ribbon.right.slice().reverse());
}
