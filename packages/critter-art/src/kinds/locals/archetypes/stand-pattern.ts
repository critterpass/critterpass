import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import type { OpSink } from '../../../core/ops';
import { blobPolygon } from '../../../core/shapes';
import type { TubeOutline } from '../../../core/shapes';
import { CREAM_WHITE } from '../helpers';
import type { ArchetypeColors } from '../types';

/**
 * design/critters-draw-1.js `X.A.stand`'s `s.pat` coat overlays: spot dots, cow patches, giraffe
 * blotches (including a few along the neck curve), zebra stripes and waldi's vertical colour bars.
 */
export function drawStandCoatPattern(
  sink: OpSink,
  pattern: string | undefined,
  colors: ArchetypeColors,
  hx: number,
  hy: number,
  neckCurve: readonly Point[],
  neck: TubeOutline,
  bodyRimY: (x: number, sign: number) => number,
): void {
  if (pattern === 'spots') {
    for (const [x, y] of [
      [50, 57],
      [58, 54],
      [66, 57],
      [62, 64],
      [52, 65],
      [72, 62],
      [45, 62],
    ] as const) {
      sink.dot(x, y, 1.9, CREAM_WHITE);
    }
  }
  if (pattern === 'cow') {
    for (const [x, y, a, b] of [
      [52, 59, 6, 4.5],
      [69, 66, 5, 4],
      [hx - 7, hy - 7, 4, 3.5],
    ] as const) {
      sink.fill(blobPolygon(x, y, a, b, 0.8, 10), colors.dk);
    }
  }
  if (pattern === 'giraffe') {
    const spots: Point[] = [
      [48, 58],
      [57, 55],
      [66, 58],
      [74, 62],
      [55, 64],
      [64, 66],
      [44, 65],
      pointAt(neckCurve, 1),
      pointAt(neckCurve, 3),
      pointAt(neckCurve, 5),
    ];
    for (const [x, y] of spots) sink.fill(blobPolygon(x, y, 3.2, 2.7, 0.7, 8), colors.dk);
  }
  if (pattern === 'zebra') {
    for (let i = 0; i < 7; i++) {
      const x = 42 + i * 5.5;
      sink.stroke(
        [
          [x - 1, bodyRimY(x, -1) + 1.5],
          [x + 1, bodyRimY(x, 1) - 2],
        ],
        colors.dk,
        2.6,
      );
    }
    for (const i of [1, 3, 5]) {
      sink.stroke([pointAt(neck.left, i), pointAt(neck.right, i)], colors.dk, 2.4);
    }
    for (const [x, y] of [
      [hx - 6, hy - 9],
      [hx + 6, hy - 9],
    ] as const) {
      sink.stroke(
        [
          [x, y],
          [x + (x - hx) * 0.3, y + 5],
        ],
        colors.dk,
        2,
      );
    }
  }
  if (pattern === 'waldi') {
    const waldiColors = ['#ffd84a', '#54d6a4', '#ff9a4d', '#ffd84a', '#54d6a4', '#ff9a4d'];
    waldiColors.forEach((color, i) => {
      const x = 44 + i * 7.5;
      sink.stroke(
        [
          [x, bodyRimY(x, -1) + 1.5],
          [x, bodyRimY(x, 1) - 1.5],
        ],
        color,
        5.5,
      );
    });
  }
}
