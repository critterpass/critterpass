import type { Point } from './geometry';
import type { Op } from './ops';

// `Pose` `'tilt'`/`'hop'` (T8): whole-body geometric transforms for the archetypes and guides design
// itself never gives a pose (`kinds/locals/poses.ts` adds each pose-less archetype's own bespoke
// raised limb/fin/antenna first; these two run afterwards, over the *complete* authored op list —
// see `core/model.ts`'s `build()`, the only place the full list is available). Both act on `Op[]`
// (already spline-tessellated, still pre-ribbon): an affine map commutes exactly with spline/ribbon
// tessellation, so transforming these points is equivalent to transforming the original control
// points, with no separate ribbon-level code needed, and it moves the sticker/edge-ring outline
// (built from this same `Op[]`) in lockstep with the body automatically.

/** Near the shared 100-unit local space's ground line, where most archetypes' feet/base sit. */
const ANCHOR: Point = [50, 88];
const TILT_DEGREES = 12;
const HOP_LIFT = 6;
const HOP_SQUASH_Y = 0.9;

type PointTransform = (point: Point) => Point;

function transformOp(op: Op, apply: PointTransform): Op {
  return { ...op, points: op.points.map(apply) };
}

/** Rotates every point by `TILT_DEGREES` about `ANCHOR`, as if the critter pivoted on its feet. */
export function applyTiltPose(ops: readonly Op[]): Op[] {
  const radians = (TILT_DEGREES * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const [anchorX, anchorY] = ANCHOR;
  const rotate: PointTransform = ([x, y]) => {
    const dx = x - anchorX;
    const dy = y - anchorY;
    return [anchorX + dx * cos - dy * sin, anchorY + dx * sin + dy * cos];
  };
  return ops.map((op) => transformOp(op, rotate));
}

/**
 * Squashes every point toward `ANCHOR`'s own y (a mid-air compression) then lifts the whole body up
 * by `HOP_LIFT` (local-unit space grows downward, so "up" subtracts).
 */
export function applyHopPose(ops: readonly Op[]): Op[] {
  const [, anchorY] = ANCHOR;
  const hop: PointTransform = ([x, y]) => [x, anchorY + (y - anchorY) * HOP_SQUASH_Y - HOP_LIFT];
  return ops.map((op) => transformOp(op, hop));
}
