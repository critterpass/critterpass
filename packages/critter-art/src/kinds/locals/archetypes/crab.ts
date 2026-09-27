import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import { W } from '../../../core/ops';
import { blobPolygon, ellipsePolygon, fluffPolygon } from '../../../core/shapes';
import { eyes, extras } from '../../parts/face';
import { drawCheekDots, drawSmile, mirrorX } from '../helpers';
import { drawSparkExtras, isEpicPose } from '../poses';
import type { ArchetypeFn } from '../types';

/** design/critters-draw-2.js `A.crab`: 1 critter (Shanghai, Xiexie). */
export const crab: ArchetypeFn = (sink, options, spec, colors) => {
  const epicPose = isEpicPose(options.pose);
  const legs: readonly [Point, Point, Point][] = [
    [[28, 66], [16, 72], [12, 82]],
    [[30, 72], [20, 80], [18, 90]],
    [[34, 76], [28, 86], [28, 94]],
  ];
  for (const l of legs) {
    for (const p of [l, mirrorX(l)]) {
      sink.stroke(p, colors.f, 4.5);
      sink.line(p, { w: 2 });
    }
  }
  const arm: Point[] = [
    [30, 58],
    [20, 50],
    [18, 43],
  ];
  const claw: Point[] = [
    [10, 40],
    [12, 26],
    [22, 24],
    [26, 32],
    [20, 34],
    [24, 40],
    [16, 44],
  ];
  // T8 epic pose (design gives `crab` no pose of its own): the right claw raises in a pinch-cheer.
  const clawLift = 14;
  for (const mm of [0, 1]) {
    const raise = epicPose && mm === 1;
    const lift: (p: Point) => Point = raise ? ([x, y]) => [x, y - clawLift] : (p) => p;
    const a = (mm ? mirrorX(arm) : arm).map(lift);
    const c = (mm ? mirrorX(claw) : claw).map(lift);
    sink.stroke(a, colors.f, 5);
    sink.line(a, { w: 2.1 });
    W(sink, c, colors.f, 2.2);
    sink.fill(fluffPolygon(mm ? 80 : 20, raise ? 46 - clawLift : 46, 6, 4.5, 6, 0.3), colors.dk);
    if (raise) drawSparkExtras(sink, pointAt(c, 1)[0], pointAt(c, 1)[1] - 6, 5, colors.dk);
  }
  for (const l of [
    [[43, 50], [41, 39]],
    [[57, 50], [59, 39]],
  ] as const) {
    sink.line(l, { w: 2.2 });
  }
  const body = blobPolygon(50, 62, 27, 17, 0.8, 16);
  sink.wash(body, colors.f);
  sink.fill(ellipsePolygon(50, 67, 15, 8, 12), colors.bl);
  sink.line(body, { w: 2.6, close: true });
  eyes(
    sink,
    options,
    [
      [41, 35],
      [59, 35],
    ],
    5,
  );
  drawSmile(sink, 50, 62, 4.5, 2.2);
  drawCheekDots(
    sink,
    [
      [36, 62],
      [64, 62],
    ],
    3,
  );
  extras(sink, options);
};
