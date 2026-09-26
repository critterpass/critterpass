/**
 * Shared point type for the renderer's math layer (splines, shapes, ribbons). Kept as `[x, y]`
 * tuples — matching design/doodles.js's own point representation — rather than a flat
 * `Float32Array`, so the port stays line-for-line comparable against the design scripts; `model.ts`
 * flattens into `Float32Array` when it builds the public `Cmd` display list.
 */
export type Point = readonly [x: number, y: number];

/**
 * Indexes into a point array with a runtime bounds check, satisfying `noUncheckedIndexedAccess`
 * without a non-null assertion. Every caller pre-clamps or wraps `index` before calling this, so it
 * only ever throws if an invariant the algorithm depends on (a non-empty point list) is violated.
 */
export function pointAt(points: readonly Point[], index: number): Point {
  const point = points[index];
  if (point === undefined) {
    throw new RangeError(`point index ${index} out of bounds (length ${points.length})`);
  }
  return point;
}

/** Polyline arc length (sum of segment lengths). Ported bit-for-bit from design/doodles.js `len`. */
export function arcLength(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = pointAt(points, i - 1);
    const b = pointAt(points, i);
    sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return sum;
}

/** Flattens `[x, y]` point tuples into the interleaved buffer the public `Cmd` payload carries. */
export function toFloat32Points(points: readonly Point[]): Float32Array {
  const out = new Float32Array(points.length * 2);
  points.forEach((p, i) => {
    out[i * 2] = p[0];
    out[i * 2 + 1] = p[1];
  });
  return out;
}
