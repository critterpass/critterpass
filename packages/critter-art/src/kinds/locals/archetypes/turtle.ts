import type { Point } from '../../../core/geometry';
import { F } from '../../../core/ops';
import { blobPolygon, superellipseArc } from '../../../core/shapes';
import { eyes, extras } from '../../parts/face';
import { drawCheekDots, drawSmile, mirrorX } from '../helpers';
import type { ArchetypeFn } from '../types';

/** design/critters-draw-2.js `A.turtle`: 2 critters, `v === 'sea'` or the plain default (Hoàn Kiếm turtle). */
export const turtle: ArchetypeFn = (sink, options, spec, colors) => {
  const isSea = spec.v === 'sea';
  const flipper: Point[] = isSea
    ? [
        [26, 60],
        [10, 52],
        [3, 57],
        [11, 66],
        [26, 68],
      ]
    : [
        [24, 70],
        [15, 70],
        [13, 78],
        [20, 81],
        [27, 78],
      ];
  const backLeg: Point[] = isSea
    ? [
        [30, 80],
        [20, 88],
        [30, 92],
        [36, 84],
      ]
    : [
        [30, 82],
        [26, 91],
        [34, 92],
        [37, 84],
      ];
  for (const p of [flipper, mirrorX(flipper), backLeg, mirrorX(backLeg)]) sink.wash(p, colors.f);
  sink.wash(blobPolygon(50, 31, 14.5, 12.5, 0.85, 14), colors.f);
  const shell: Point[] = [
    [15, 76],
    [19, 60],
    [31, 47],
    [50, 42.5],
    [69, 47],
    [81, 60],
    [85, 76],
    [72, 82.5],
    [50, 84.5],
    [28, 82.5],
  ];
  sink.wash(shell, colors.dk);
  const hex: Point[] = [
    [42, 56],
    [50, 51],
    [58, 56],
    [58, 66],
    [50, 71],
    [42, 66],
  ];
  sink.fill(hex, colors.f);
  sink.line(shell, { w: 2.6, close: true });
  sink.line(hex, { w: 1.8, close: true });
  for (const l of [
    [[42, 56], [30, 51]],
    [[58, 56], [70, 51]],
    [[42, 66], [24, 70]],
    [[58, 66], [76, 70]],
    [[50, 51], [50, 43.5]],
    [[50, 71], [50, 79.5]],
  ] as const) {
    sink.line(l, { w: 1.6 });
  }
  sink.line(
    [
      [16, 76],
      [50, 80.5],
      [84, 76],
    ],
    { w: 1.8 },
  );
  for (const p of [flipper, mirrorX(flipper), backLeg, mirrorX(backLeg)]) sink.line(p, { w: 2.2 });
  sink.line(superellipseArc(50, 31, 14.5, 12.5, 0.85, 2.3, 7.12, 16), { w: 2.5 });
  eyes(
    sink,
    options,
    [
      [44, 30],
      [56, 30],
    ],
    4.4,
  );
  drawSmile(sink, 50, 35.5, 4, 2);
  drawCheekDots(
    sink,
    [
      [38.5, 35.5],
      [61.5, 35.5],
    ],
    2.6,
  );
  if (spec.acc === 'sword') {
    F(
      sink,
      [
        [86.5, 24],
        [89.5, 24],
        [89.5, 64],
        [88, 69],
        [86.5, 64],
      ],
      '#e2e8f4',
      1.8,
    );
    sink.stroke(
      [
        [82.5, 24],
        [93.5, 24],
      ],
      '#ffd84a',
      3.4,
    );
    sink.line(
      [
        [82.5, 24],
        [93.5, 24],
      ],
      { w: 1.8 },
    );
    sink.stroke(
      [
        [88, 24],
        [88, 15],
      ],
      '#b86a3f',
      3.6,
    );
    sink.line(
      [
        [88, 24],
        [88, 15],
      ],
      { w: 1.8 },
    );
    sink.dot(88, 13.5, 2.2, '#ffd84a');
  }
  extras(sink, options);
};
