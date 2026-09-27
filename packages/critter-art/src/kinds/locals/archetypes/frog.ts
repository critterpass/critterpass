import type { Point } from '../../../core/geometry';
import { ellipsePolygon } from '../../../core/shapes';
import { eyes, extras, iris, toes } from '../../parts/face';
import { CRITTER_INK, drawCheekDots, mirrorX } from '../helpers';
import { drawSparkExtras, isEpicPose } from '../poses';
import type { ArchetypeFn } from '../types';

/** design/critters-draw-2.js `A.frog`: 3 critters, `v === 'tree'` (with an optional `red` accent) or the plain default. */
export const frog: ArchetypeFn = (sink, options, spec, colors) => {
  const epicPose = isEpicPose(options.pose);
  const isTree = spec.v === 'tree';
  const backLeg: Point[] = [
    [22, 71],
    [12, 74],
    [9, 81],
    [17, 88],
    [30, 87],
  ];
  for (const p of [backLeg, mirrorX(backLeg)]) sink.wash(p, colors.f);

  const silhouette: Point[] = [
    [18, 64], [20, 48], [23, 36], [28, 28], [36, 26.5], [43, 30.5], [50, 32.5], [57, 30.5], [64, 26.5],
    [72, 28], [77, 36], [80, 48], [82, 64], [76, 79], [62, 86], [38, 86], [24, 79],
  ];
  sink.wash(silhouette, colors.f);
  sink.fill(ellipsePolygon(50, 72, 17, 11.5, 12), colors.bl);
  if (spec.pat === 'spots') {
    for (const [x, y] of [
      [30, 50],
      [70, 50],
      [40, 44],
      [60, 44],
      [26, 64],
      [74, 64],
      [50, 40],
    ] as const) {
      sink.dot(x, y, 2, colors.dk, 0.8);
    }
  }
  if (isTree && spec.red) {
    for (const [x, y] of [
      [20, 60],
      [80, 60],
    ] as const) {
      sink.stroke(
        [
          [x, y - 6],
          [x, y + 8],
        ],
        '#4f86ff',
        3,
      );
    }
  }
  sink.line(silhouette, { w: 2.6, close: true });
  for (const p of [backLeg, mirrorX(backLeg)]) sink.line(p, { w: 2.3 });

  // T8 epic pose (design gives `frog` no pose of its own): the right front leg reaches up.
  const frontLegs: readonly [Point, Point][] = [
    [[36, 77], [32, 89]],
    [[64, 77], [68, 89]],
  ];
  for (const [i, base] of frontLegs.entries()) {
    const raised = epicPose && i === 1;
    const tip: Point = raised ? [80, 60] : base[1];
    const l: [Point, Point] = [base[0], tip];
    sink.line(l, { w: 2.3, taper: false });
    if (isTree) {
      for (const k of [-3, 0, 3]) sink.dot(l[1][0] + k, l[1][1] + 1.5, 1.9, spec.red ? '#ff9a4d' : colors.bl);
    } else {
      toes(sink, l, CRITTER_INK);
    }
    if (raised) drawSparkExtras(sink, tip[0] + 4, tip[1] - 4, 5, colors.dk);
  }
  for (const [x, y] of [
    [13, 89],
    [87, 89],
  ] as const) {
    if (isTree) {
      for (const k of [-3, 0, 3]) sink.dot(x + k, y, 1.9, spec.red ? '#ff9a4d' : colors.bl);
    } else {
      toes(sink, [[x + (x < 50 ? 4 : -4), y - 5], [x, y]], CRITTER_INK);
    }
  }
  if (spec.red) {
    iris(
      sink,
      options,
      [
        [33, 36],
        [67, 36],
      ],
      7,
      '#ff4a3d',
    );
  } else {
    eyes(
      sink,
      options,
      [
        [33, 36],
        [67, 36],
      ],
      7,
    );
  }
  sink.line(
    [
      [30, 55],
      [40, 59.5],
      [50, 60.5],
      [60, 59.5],
      [70, 55],
    ],
    { w: 2.2 },
  );
  drawCheekDots(
    sink,
    [
      [26, 58],
      [74, 58],
    ],
    3.4,
  );
  extras(sink, options);
};
