import type { Point } from '../../../core/geometry';
import type { OpSink } from '../../../core/ops';
import { superellipseArc } from '../../../core/shapes';
import { CREAM_WHITE } from '../helpers';
import type { ArchetypeColors } from '../types';

/** design/critters-draw-2.js `A.fish`'s `s.pat` overlays (scales/bands/dots/wspots/humu/bars/bluedots). */
export function drawFishPattern(sink: OpSink, pattern: string | undefined, colors: ArchetypeColors): void {
  if (pattern === 'scales') {
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 4; i++) {
        sink.line(superellipseArc(30 + i * 9 + (r % 2) * 4.5, 42 + r * 8, 3.8, 3.4, 1, -1.2, 1.2, 5), {
          w: 1.4,
          color: colors.dk,
        });
      }
    }
  }
  if (pattern === 'bands') {
    const bands: readonly [Point, Point, Point, Point][] = [
      [[62, 25], [68, 27.5], [67, 73], [61, 76.5]],
      [[43, 23.5], [51, 23.5], [51, 78.5], [43, 78.5]],
      [[24, 36], [29, 31], [29, 72], [24, 67]],
    ];
    for (const p of bands) {
      sink.fill(p, CREAM_WHITE);
      sink.line([p[0], p[3]], { w: 1.8 });
      sink.line([p[1], p[2]], { w: 1.8 });
    }
  }
  if (pattern === 'dots') {
    for (const [x, y] of [
      [40, 40],
      [52, 36],
      [46, 52],
      [58, 58],
      [34, 58],
      [64, 46],
      [30, 46],
    ] as const) {
      sink.dot(x, y, 1.7, colors.dk, 0.9);
    }
  }
  if (pattern === 'wspots') {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        sink.dot(22 + i * 10 + (j % 2) * 5, 44 + j * 6, 1.4, CREAM_WHITE);
      }
    }
  }
  if (pattern === 'humu') {
    sink.fill(
      [
        [44, 24],
        [54, 24],
        [42, 78],
        [32, 74],
      ],
      colors.dk,
    );
    sink.line(
      [
        [74, 50],
        [86, 47],
      ],
      { w: 1.8, color: '#4f86ff' },
    );
    sink.line(
      [
        [72, 56],
        [84, 56],
      ],
      { w: 1.8, color: '#4f86ff' },
    );
    sink.fill(
      [
        [62, 30],
        [70, 34],
        [66, 40],
      ],
      '#ff5a4d',
    );
  }
  if (pattern === 'bars') {
    for (const x of [30, 40, 50, 60]) {
      sink.stroke(
        [
          [x, 38],
          [x - 2, 60],
        ],
        colors.dk,
        3.2,
      );
    }
  }
  if (pattern === 'bluedots') {
    for (const [x, y] of [
      [30, 70],
      [42, 66],
      [56, 64],
      [66, 60],
      [36, 74],
      [50, 71],
    ] as const) {
      sink.dot(x, y, 1.3, '#4f86ff');
    }
  }
}
