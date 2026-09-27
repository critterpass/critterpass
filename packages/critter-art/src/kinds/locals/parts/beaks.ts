import type { Point } from '../../../core/geometry';
import { blobPolygon } from '../../../core/shapes';

/** design/critters-draw-2.js `BEAK` (used by `bird` only): a viewbox-local polygon per beak shape, keyed by `spec.beak`. */
export const BEAK: Readonly<Record<string, readonly Point[]>> = {
  short: [
    [44.5, 43],
    [55.5, 43],
    [50, 50.5],
  ],
  cone: [
    [44, 42],
    [56, 42],
    [50, 51.5],
  ],
  pen: [
    [46, 43],
    [54, 43],
    [50, 51],
  ],
  hook: [
    [44, 41.5],
    [56, 41.5],
    [55.5, 47],
    [51, 53.5],
    [49.5, 48.5],
    [44.5, 46.5],
  ],
  duck: blobPolygon(50, 46, 9.5, 4.6, 0.7, 12),
  long: [
    [46, 42.5],
    [54, 42.5],
    [52.5, 50],
    [48, 63],
    [46.2, 62.5],
    [47.5, 50],
  ],
  kiwi: [
    [47.5, 44],
    [52.5, 44],
    [51.2, 73],
    [49.2, 73.5],
  ],
  gull: [
    [44.5, 42.5],
    [55.5, 42.5],
    [54.5, 48],
    [50, 53],
    [45.5, 48],
  ],
  owl: [
    [46.5, 44],
    [53.5, 44],
    [50, 49.5],
  ],
  raven: [
    [43.5, 42],
    [56.5, 42],
    [55, 48],
    [50, 55],
    [45, 48],
  ],
  needle: [
    [47.5, 44],
    [52, 44],
    [42, 70],
    [40.5, 69.5],
  ],
};
