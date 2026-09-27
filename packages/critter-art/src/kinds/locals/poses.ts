import type { Point } from '../../core/geometry';
import type { OpSink } from '../../core/ops';
import { W } from '../../core/ops';

/**
 * True for either of the two whole-body pose transforms (`core/pose-transform.ts`'s `applyTiltPose`/
 * `applyHopPose`, wired into `core/model.ts`'s `build()`). The 12 archetypes design itself never gives
 * a pose gate their one bespoke raised-limb/fin/antenna flourish on this rather than on a specific
 * pose value, since both transforms share the same flourish and differ only in the whole-body motion
 * `build()` applies afterwards.
 */
export function isEpicPose(pose: string | undefined): boolean {
  return pose === 'tilt' || pose === 'hop';
}

/**
 * design/doodles.js `K.spark`'s own 8-point radiating star (its `[[50,8],[58,42],[92,50],...]`
 * shape, alternating long/short points), scaled and repositioned as the small celebration flourish
 * next to whichever part an epic pose raises, reusing the spark icon's own geometry rather than
 * authoring a new shape.
 */
export function drawSparkExtras(sink: OpSink, x: number, y: number, r: number, color: string): void {
  const points: Point[] = [
    [x, y - r],
    [x + r * 0.36, y - r * 0.36],
    [x + r, y],
    [x + r * 0.36, y + r * 0.36],
    [x, y + r],
    [x - r * 0.36, y + r * 0.36],
    [x - r, y],
    [x - r * 0.36, y - r * 0.36],
  ];
  W(sink, points, color, 1.6);
}
