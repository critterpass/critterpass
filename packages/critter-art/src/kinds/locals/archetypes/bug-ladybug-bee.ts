import type { Point } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { blobPolygon, ellipsePolygon } from '../../../core/shapes';
import { eyes, extras } from '../../parts/face';
import { drawAccessory } from '../parts/accessories';
import { CREAM_WHITE, CRITTER_INK, drawCheekDots, drawSmile } from '../helpers';
import { isEpicPose } from '../poses';
import type { KindDrawOptions } from '../../registry';
import type { ArchetypeColors } from '../types';
import type { CritterSpec } from '../../../data/types';

/** design/critters-draw-2.js `A.bug` branch `v === 'ladybug'` (Keukenhof). Legs mirror around x=52 (`104 - x`), not the usual x=50 axis — kept literal for fidelity. */
export function drawLadybug(
  sink: OpSink,
  options: KindDrawOptions,
  spec: Pick<CritterSpec, 'acc' | 'sc'>,
  colors: ArchetypeColors,
): void {
  for (const [x, y] of [
    [26, 58],
    [24, 70],
    [28, 80],
  ] as const) {
    sink.line(
      [
        [x + 4, y],
        [x - 4, y + 3],
      ],
      { w: 2 },
    );
    sink.line(
      [
        [104 - x - 4, y],
        [104 - x + 4, y + 3],
      ],
      { w: 2 },
    );
  }
  const body = blobPolygon(50, 62, 29, 25, 0.85, 16);
  sink.wash(body, colors.f);
  const head = blobPolygon(50, 36, 16, 12, 0.85, 14);
  sink.wash(head, colors.dk);
  for (const [x, y, r] of [
    [38, 56, 4.5],
    [62, 56, 4.5],
    [36, 72, 4],
    [64, 72, 4],
    [50, 81, 3.5],
  ] as const) {
    sink.fill(ellipsePolygon(x, y, r, r, 10), colors.dk);
  }
  sink.line(body, { w: 2.6, close: true });
  sink.line(
    [
      [50, 48],
      [50, 86],
    ],
    { w: 2 },
  );
  sink.line(head, { w: 2.3, close: true });
  // T8 epic pose (design gives `bug` no pose of its own): antennae perk up further, tips enlarged.
  const epicPose = isEpicPose(options.pose);
  const antennae: readonly [Point, Point, Point][] = epicPose
    ? [
        [[44, 26], [38, 10], [32, 4]],
        [[56, 26], [62, 10], [68, 4]],
      ]
    : [
        [[44, 26], [40, 15], [36, 13]],
        [[56, 26], [60, 15], [64, 13]],
      ];
  for (const l of antennae) {
    sink.line(l, { w: 1.8 });
    sink.dot(l[2][0], l[2][1], epicPose ? 3 : 2, CRITTER_INK);
  }
  eyes(
    sink,
    options,
    [
      [44, 35],
      [56, 35],
    ],
    4.4,
  );
  drawSmile(sink, 50, 40.5, 3.2, 1.6, CREAM_WHITE);
  drawCheekDots(
    sink,
    [
      [39, 41],
      [61, 41],
    ],
    2.4,
  );
  drawAccessory(sink, spec, colors, { x: 0, y: 0, w: 0, cy: 0, ny: 0, nw: 0, hx: 0, hy: 0 });
  extras(sink, options);
}

/** design/critters-draw-2.js `A.bug` branch `v === 'bee'` (Manchester). */
export function drawBee(sink: OpSink, options: KindDrawOptions, colors: ArchetypeColors): void {
  const epicPose = isEpicPose(options.pose);
  for (const [x, y, r] of [
    [31, 36, -0.5],
    [69, 36, 0.5],
  ] as const) {
    W(sink, ellipsePolygon(x, y, 12, 8, 12, r), '#eaf6ff', 1.9);
  }
  const body = blobPolygon(50, 60, 24, 27, 0.85, 16);
  sink.wash(body, colors.f);
  sink.fill(ellipsePolygon(50, 68, 20, 4.2, 12), colors.dk);
  sink.fill(ellipsePolygon(50, 79, 12, 3.6, 10), colors.dk);
  sink.line(body, { w: 2.6, close: true });
  F(
    sink,
    [
      [47, 86.5],
      [53, 86.5],
      [50, 93],
    ],
    CRITTER_INK,
    1.5,
  );
  // T8 epic pose (design gives `bug` no pose of its own): antennae perk up further, tips enlarged.
  const antennae: readonly [Point, Point, Point][] = epicPose
    ? [
        [[44, 34], [38, 14], [30, 9]],
        [[56, 34], [62, 14], [70, 9]],
      ]
    : [
        [[44, 34], [40, 22], [35, 19]],
        [[56, 34], [60, 22], [65, 19]],
      ];
  for (const l of antennae) {
    sink.line(l, { w: 1.8 });
    sink.dot(l[2][0], l[2][1], epicPose ? 3 : 2.2, CRITTER_INK);
  }
  for (const [x, y] of [
    [36, 84],
    [64, 84],
  ] as const) {
    sink.line(
      [
        [x, y],
        [x + (x < 50 ? -4 : 4), y + 5],
      ],
      { w: 2 },
    );
  }
  eyes(
    sink,
    options,
    [
      [42, 49],
      [58, 49],
    ],
    5,
  );
  drawSmile(sink, 50, 55.5, 4, 2);
  drawCheekDots(
    sink,
    [
      [35, 57],
      [65, 57],
    ],
    3,
  );
  extras(sink, options);
}
