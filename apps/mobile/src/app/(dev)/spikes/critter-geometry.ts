// Pure brush-ribbon maths ported from design/doodles.js (read-only source; a DOM custom element,
// so it cannot be imported here — this is a port, kept close to the original variable names).
// Not a route: expo-router scans every file under src/app/ as a route candidate (see the default
// export at the bottom) even though this module has no screen.

export type Point = readonly [number, number];

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined)
    throw new Error(`critter-geometry: index ${index} out of range (length ${items.length})`);
  return value;
}

/** Deterministic PRNG (mulberry32-style), ported from doodles.js `rng` — seeds the brush wobble. */
export function seededRng(seed: number): () => number {
  let a = (seed * 1000003) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom resample, ported from doodles.js `spl`. */
export function catmullRomSpline(points: readonly Point[], close: boolean, step = 1.1): Point[] {
  const n = points.length;
  if (n < 2) return points.slice();
  const out: Point[] = [];
  const wrap = (i: number) =>
    close ? at(points, ((i % n) + n) % n) : at(points, Math.max(0, Math.min(n - 1, i)));
  const segments = close ? n : n - 1;
  for (let i = 0; i < segments; i += 1) {
    const p0 = wrap(i - 1);
    const p1 = wrap(i);
    const p2 = wrap(i + 1);
    const p3 = wrap(i + 2);
    const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < steps; j += 1) {
      const t = j / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const axis = (d: 0 | 1) =>
        0.5 *
        (2 * p1[d] +
          (-p0[d] + p2[d]) * t +
          (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 +
          (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
      out.push([axis(0), axis(1)]);
    }
  }
  out.push(close ? at(points, 0) : at(points, n - 1));
  return out;
}

/** Point ring on an ellipse, ported from doodles.js `E`. */
export function ellipsePoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n = 12,
  rot = 0,
): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Point;
  });
}

export function polylineLength(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = at(points, i - 1);
    const b = at(points, i);
    sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return sum;
}

export interface RibbonOptions {
  readonly w: number;
  readonly minW: number;
  readonly taper: boolean;
  readonly close: boolean;
  readonly seed: number;
  readonly amp: number;
}

/**
 * Variable-width "brush ribbon" fill polygon from a centreline, ported from doodles.js `ribbon()`.
 * This tessellation is the per-frame cost the spike measures. `fullPointCount` is the whole
 * stroke's point count (not just the revealed prefix in `points`) so taper does not distort
 * mid draw-on.
 */
export function buildRibbonPolygon(
  points: readonly Point[],
  fullPointCount: number,
  o: RibbonOptions,
): Point[] {
  const n = points.length;
  if (n < 2) return [];
  const random = seededRng(o.seed);
  const phase1 = random() * 6.28;
  const phase2 = random() * 6.28;
  const wobbled: Point[] = points.map((p, i) => [
    p[0] + Math.sin(i * 0.07 + phase1) * o.amp,
    p[1] + Math.cos(i * 0.061 + phase2) * o.amp,
  ]);
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = at(wobbled, Math.max(0, i - 1));
    const b = at(wobbled, Math.min(n - 1, i + 1));
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    const nx = -dy / m;
    const ny = dx / m;
    const t = i / Math.max(1, fullPointCount - 1);
    const press = o.close
      ? 0.78 + 0.22 * Math.sin(t * 6.28 * 2 + phase1)
      : o.taper
        ? Math.pow(Math.max(0.02, Math.sin(Math.PI * (0.06 + 0.88 * t))), 0.5)
        : 1;
    const halfWidth = Math.max(o.minW, o.w * press * (0.9 + 0.2 * Math.sin(i * 0.19 + phase2))) / 2;
    const point = at(wobbled, i);
    left.push([point[0] + nx * halfWidth, point[1] + ny * halfWidth]);
    right.push([point[0] - nx * halfWidth, point[1] - ny * halfWidth]);
  }
  return left.concat(right.reverse());
}

// See the file header: this module is not a screen, only a math helper next to route files.
export default {};
