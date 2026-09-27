import { type Point, pointAt } from './geometry';

/** Regular n-gon approximating an ellipse. Ported bit-for-bit from design/doodles.js `E`. */
export function ellipsePolygon(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n = 12,
  rot = 0,
): Point[] {
  return Array.from({ length: n }, (_, i): Point => {
    const a = rot + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
}

/**
 * Superellipse arc between two angles. Ported bit-for-bit from design/critters-draw-1.js `arcB`;
 * `blobPolygon` below is the closed special case (`design/critters-draw-1.js` `blob`).
 */
export function superellipseArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  exponent: number,
  startAngle: number,
  endAngle: number,
  segments = 14,
): Point[] {
  return Array.from({ length: segments + 1 }, (_, i): Point => {
    const a = startAngle + ((endAngle - startAngle) * i) / segments;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [
      cx + rx * Math.sign(c) * Math.abs(c) ** exponent,
      cy + ry * Math.sign(s) * Math.abs(s) ** exponent,
    ];
  });
}

/** Closed superellipse polygon. Ported bit-for-bit from design/critters-draw-1.js `blob`. */
export function blobPolygon(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  exponent = 0.8,
  n = 16,
): Point[] {
  return superellipseArc(cx, cy, rx, ry, exponent, 0, (6.2832 * (n - 1)) / n, n - 1);
}

/**
 * Alternating long/short-radius star polygon used for fur tufts and petals. Ported bit-for-bit
 * from design/critters-draw-1.js `fluff`.
 */
export function fluffPolygon(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  points: number,
  amplitude: number,
): Point[] {
  return Array.from({ length: points * 2 }, (_, i): Point => {
    const a = (i / (points * 2)) * 6.2832 - 1.5708;
    const r = i % 2 ? 1 : 1 + amplitude;
    return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r];
  });
}

/**
 * Quadratic Bezier curve sampled into `n + 1` points. Ported bit-for-bit from
 * design/critters-draw-1.js `bez`.
 */
export function quadraticBezier(p0: Point, p1: Point, p2: Point, n = 6): Point[] {
  return Array.from({ length: n + 1 }, (_, i): Point => {
    const t = i / n;
    const u = 1 - t;
    return [
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ];
  });
}

/**
 * Fixed-subdivision (non-adaptive) Catmull-Rom resampling of an open polyline, used for
 * centrelines (necks, tails) before `tubeOutline` widens them. Ported bit-for-bit from
 * design/critters-draw-1.js `crs` — distinct from `catmullRomSpline`'s chord-adaptive stepping.
 */
export function catmullRomResample(points: readonly Point[], segmentsPerSpan = 4): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = pointAt(points, Math.max(0, i - 1));
    const p1 = pointAt(points, i);
    const p2 = pointAt(points, i + 1);
    const p3 = pointAt(points, Math.min(points.length - 1, i + 2));
    for (let j = 0; j < segmentsPerSpan; j++) {
      const t = j / segmentsPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      const axis = (d: 0 | 1): number =>
        0.5 *
        (2 * p1[d] +
          (-p0[d] + p2[d]) * t +
          (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 +
          (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
      out.push([axis(0), axis(1)]);
    }
  }
  out.push(pointAt(points, points.length - 1));
  return out;
}

export interface TubeOutline {
  readonly left: Point[];
  readonly right: Point[];
  readonly polygon: Point[];
}

/**
 * Offsets a centreline into a tapered left/right outline (necks, tails, limbs). Ported bit-for-bit
 * from design/critters-draw-1.js `tube`.
 */
export function tubeOutline(
  points: readonly Point[],
  startWidth: number,
  endWidth: number,
): TubeOutline {
  const left: Point[] = [];
  const right: Point[] = [];
  points.forEach((p, i) => {
    const a = pointAt(points, Math.max(0, i - 1));
    const b = pointAt(points, Math.min(points.length - 1, i + 1));
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    const w = (startWidth + (endWidth - startWidth) * (i / (points.length - 1))) / 2;
    left.push([p[0] + (dy / m) * w, p[1] - (dx / m) * w]);
    right.push([p[0] - (dy / m) * w, p[1] + (dx / m) * w]);
  });
  return { left, right, polygon: left.concat(right.slice().reverse()) };
}
