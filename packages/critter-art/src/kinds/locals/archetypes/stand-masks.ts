import type { OpSink } from '../../../core/ops';
import { blobPolygon } from '../../../core/shapes';
import { CREAM_WHITE } from '../helpers';
import type { ArchetypeColors } from '../types';
import type { CritterSpec } from '../../../data/types';

/** design/critters-draw-1.js `X.A.stand`'s inline `s.mask` branches (saola/chamois/oryx) — distinct from the shared `MASK` table, which `sit` alone uses. */
export function drawStandMask(
  sink: OpSink,
  spec: Pick<CritterSpec, 'mask'>,
  colors: ArchetypeColors,
  hx: number,
  hy: number,
  hrx: number,
  hry: number,
): void {
  if (spec.mask === 'saola') {
    for (const [x, y, r] of [
      [hx - 7.5, hy + 4.5, 2.6],
      [hx + 7.5, hy + 4.5, 2.6],
      [hx - 6, hy - 9, 1.8],
      [hx + 6, hy - 9, 1.8],
    ] as const) {
      sink.dot(x, y, r, CREAM_WHITE);
    }
  }
  if (spec.mask === 'chamois') {
    sink.fill(blobPolygon(hx, hy + 1, hrx * 0.78, hry * 0.82, 0.8, 12), CREAM_WHITE);
    for (const m of [-1, 1]) {
      sink.stroke(
        [
          [hx + m * 9, hy - 11],
          [hx + m * 7.8, hy - 2.5],
          [hx + m * 4.5, hy + 7],
        ],
        colors.dk,
        4,
      );
    }
  }
  if (spec.mask === 'oryx') {
    for (const m of [-1, 1]) {
      sink.stroke(
        [
          [hx + m * 9, hy - 10],
          [hx + m * 7.8, hy - 2.5],
          [hx + m * 6, hy + 6],
        ],
        colors.dk,
        3.8,
      );
    }
    sink.fill(blobPolygon(hx, hy - 3, 3.2, 5, 0.8, 8), colors.dk);
  }
}
