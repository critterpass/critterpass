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
