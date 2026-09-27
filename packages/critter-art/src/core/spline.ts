import { type Point, pointAt } from './geometry';

/**
 * Uniform Catmull-Rom spline tessellation, ported bit-for-bit from design/doodles.js `spl`.
 * Subdivision is chord-length adaptive (`step` local units per segment), so the same control
 * polygon tessellates to the same point density at every render size — no per-size facets.
 */
export function catmullRomSpline(points: readonly Point[], close: boolean, step = 1.1): Point[] {
  const n = points.length;
  if (n < 2) return points.slice();
  const at = (index: number): Point =>
    close
      ? pointAt(points, ((index % n) + n) % n)
      : pointAt(points, Math.max(0, Math.min(n - 1, index)));
  const segments = close ? n : n - 1;
  const out: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const k = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
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
  out.push(close ? pointAt(points, 0) : pointAt(points, n - 1));
  return out;
}
