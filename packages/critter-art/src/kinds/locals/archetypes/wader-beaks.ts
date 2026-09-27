import type { Point } from '../../../core/geometry';

/**
 * design/critters-draw-2.js `A.wader`'s beak polygons, keyed by `spec.beak` (falls back to `long`).
 * The pouch beak is drawn separately in wader.ts itself since it layers two overlapping fills
 * rather than tracing a single polygon.
 */
export const BEAK_SHAPES: Readonly<Record<string, readonly Point[]>> = {
  long: [
    [-8, 0],
    [-28, 4.5],
    [-8, 5],
  ],
  swan: [
    [-8, 0.5],
    [-18, 4],
    [-8, 6],
  ],
  hook: [
    [-8, 0],
    [-21, 1.5],
    [-23.5, 5.5],
    [-20, 4.2],
    [-8, 5],
  ],
  flamingo: [
    [-7, -1.5],
    [-15, 0.5],
    [-19.5, 8],
    [-16.5, 12.5],
    [-12.5, 6.5],
    [-6.5, 5],
  ],
};
