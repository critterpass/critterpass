import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import { F } from '../../../core/ops';
import { blobPolygon, ellipsePolygon } from '../../../core/shapes';
import { extras, isShut } from '../../parts/face';
import { drawAccessory } from '../parts/accessories';
import { drawCheekDots, drawSmile } from '../helpers';
import { drawSparkExtras, isEpicPose } from '../poses';
import type { ArchetypeFn } from '../types';

/** design/critters-draw-2.js `A.octo`: 1 critter (Venice, Seppia). */
export const octo: ArchetypeFn = (sink, options, spec, colors) => {
  const epicPose = isEpicPose(options.pose);
  const head = blobPolygon(50, 43, 30, 27, 0.9, 18);
  sink.wash(head, colors.bl);
  // Epic pose (design gives `octo` no pose of its own): the last tentacle curls up in a wave.
  for (let i = 0; i < 8; i++) {
    const x = 31 + i * 5.4;
    const mirrorSign = i < 4 ? -1 : 1;
    const raise = epicPose && i === 7;
    const tentacle: Point[] = raise
      ? [
          [x, 60],
          [x + 4, 44],
          [x + 8, 30],
          [x + 5, 20],
        ]
      : [
          [x, 60],
          [x + mirrorSign * 2, 74],
          [x + mirrorSign * 5, 83],
          [x + mirrorSign * 2.5, 88],
        ];
    sink.stroke(tentacle, colors.f, 5.2);
    sink.line(tentacle, { w: 1.8 });
    if (raise) {
      const tip = pointAt(tentacle, 3);
      drawSparkExtras(sink, tip[0] + 3, tip[1] - 4, 5, colors.dk);
    }
  }
  const mantle = blobPolygon(50, 42, 25, 23, 0.9, 18);
  sink.wash(mantle, colors.f);
  for (const l of [
    [
      [34, 28],
      [40, 25],
      [46, 28],
    ],
    [
      [54, 28],
      [60, 25],
      [66, 28],
    ],
    [
      [30, 38],
      [36, 36],
    ],
    [
      [64, 36],
      [70, 38],
    ],
    [
      [44, 22],
      [50, 20],
      [56, 22],
    ],
  ] as const) {
    sink.stroke(l, colors.dk, 2.6);
  }
  sink.line(head, { w: 1.6, close: true });
  sink.line(mantle, { w: 2.6, close: true });
  for (const [x, y] of [
    [38, 48],
    [62, 48],
  ] as const) {
    if (isShut(options)) {
      sink.line(
        [
          [x - 4.5, y],
          [x, y + 3],
          [x + 4.5, y],
        ],
        { w: 2.2 },
      );
      // The open branch below consumes two seeds (F's line, then the eyebrow line) this branch
      // only consumes one — reserve the missing seed here in stable mode so later ribbons wobble
      // the same way regardless of blink state.
      if (options.seedMode === 'stable') sink.reserveSeed();
      continue;
    }
    F(sink, ellipsePolygon(x, y, 6, 6, 14), options.eye, 2.1);
    sink.line(
      [
        [x - 3.6, y - 1],
        [x - 1.8, y + 2],
        [x, y],
        [x + 1.8, y + 2],
        [x + 3.6, y - 1],
      ],
      { w: 2 },
    );
  }
  drawSmile(sink, 50, 57, 4, 2);
  drawCheekDots(
    sink,
    [
      [31, 54],
      [69, 54],
    ],
    3,
  );
  drawAccessory(sink, spec, colors, { x: 50, y: 20, w: 20, cy: 0, ny: 0, nw: 0, hx: 0, hy: 0 });
  extras(sink, options);
};
