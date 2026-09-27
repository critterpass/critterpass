import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import { blobPolygon, ellipsePolygon } from '../../../core/shapes';
import { dotEyes, extras } from '../../parts/face';
import { drawAccessory } from '../parts/accessories';
import { CRITTER_INK, drawCheekDots, mirrorX } from '../helpers';
import { drawSparkExtras, isEpicPose } from '../poses';
import type { ArchetypeFn } from '../types';

/** design/critters-draw-2.js `A.seal`: 3 critters, `v === 'dugong'` or the plain default (harbour/grey seal). */
export const seal: ArchetypeFn = (sink, options, spec, colors) => {
  const epicPose = isEpicPose(options.pose);
  const isDugong = spec.v === 'dugong';
  if (isDugong) {
    W(
      sink,
      [
        [40, 86],
        [22, 96],
        [50, 92],
        [78, 96],
        [60, 86],
      ],
      colors.f,
      2.2,
    );
  } else {
    for (const p of [
      [[40, 88], [28, 96], [44, 96]],
      [[60, 88], [72, 96], [56, 96]],
    ] as const) {
      W(sink, p, colors.dk, 2);
    }
  }
  const body: Point[] = [
    [50, 20],
    [34, 26],
    [27, 44],
    [26, 66],
    [31, 82],
    [42, 90],
    [58, 90],
    [69, 82],
    [74, 66],
    [73, 44],
    [66, 26],
  ];
  sink.wash(body, colors.f);
  sink.fill(ellipsePolygon(50, 68, 15, 16, 12), colors.bl);
  if (spec.pat === 'speckle') {
    for (const [x, y] of [
      [36, 34],
      [64, 32],
      [32, 52],
      [68, 54],
      [40, 80],
      [62, 82],
      [30, 66],
      [70, 70],
    ] as const) {
      sink.dot(x, y, 1.4, colors.dk);
    }
  }
  if (spec.pat === 'blotch') {
    for (const [x, y, r] of [
      [34, 36, 3],
      [66, 40, 2.4],
      [30, 60, 2.6],
      [70, 64, 3],
    ] as const) {
      sink.fill(blobPolygon(x, y, r, r * 0.8, 0.8, 8), colors.dk);
    }
  }
  const flipper: Point[] = [
    [28, 56],
    [15, 67],
    [18, 72],
    [29, 66],
  ];
  // Epic pose (design gives `seal` no pose of its own): the right flipper raises in a wave.
  const rightFlipper: Point[] = epicPose
    ? mirrorX(flipper).map(([x, y]): Point => [x, y - 12])
    : mirrorX(flipper);
  for (const p of [flipper, rightFlipper]) sink.wash(p, colors.f);
  sink.line(body, { w: 2.6, close: true });
  for (const p of [flipper, rightFlipper]) sink.line(p, { w: 2.2 });
  if (epicPose) {
    const tip = pointAt(rightFlipper, 1);
    drawSparkExtras(sink, tip[0] + 3, tip[1] - 5, 5, colors.dk);
  }
  if (isDugong) {
    F(sink, blobPolygon(50, 51, 13, 8, 0.75, 12), colors.bl, 2);
    sink.dot(46, 47, 1.2, CRITTER_INK);
    sink.dot(54, 47, 1.2, CRITTER_INK);
    for (const [x, y] of [
      [42, 53],
      [45, 55],
      [55, 55],
      [58, 53],
    ] as const) {
      sink.dot(x, y, 0.8, CRITTER_INK);
    }
    dotEyes(
      sink,
      options,
      [
        [40, 40],
        [60, 40],
      ],
      3,
    );
  } else {
    sink.fill(ellipsePolygon(45, 50, 6, 4.6, 10), colors.bl);
    sink.fill(ellipsePolygon(55, 50, 6, 4.6, 10), colors.bl);
    sink.fill(
      [
        [46.8, 45],
        [53.2, 45],
        [50, 48.2],
      ],
      CRITTER_INK,
    );
    for (const [x, y] of [
      [42, 50],
      [44, 52.5],
      [58, 50],
      [56, 52.5],
    ] as const) {
      sink.dot(x, y, 0.8, CRITTER_INK);
    }
    dotEyes(
      sink,
      options,
      [
        [40.5, 39],
        [59.5, 39],
      ],
      4.3,
    );
  }
  drawCheekDots(
    sink,
    [
      [34, 47],
      [66, 47],
    ],
    3,
  );
  drawAccessory(sink, spec, colors, { x: 50, y: 20, w: 20, cy: 36, ny: 60, nw: 16, hx: 0, hy: 0 });
  extras(sink, options);
};
