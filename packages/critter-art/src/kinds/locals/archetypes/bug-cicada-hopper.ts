import type { Point } from '../../../core/geometry';
import { W } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { blobPolygon, ellipsePolygon } from '../../../core/shapes';
import { eyes, extras } from '../../parts/face';
import { drawCheekDots, drawSmile, mirrorX } from '../helpers';
import { isEpicPose } from '../poses';
import type { KindDrawOptions } from '../../registry';
import type { ArchetypeColors } from '../types';

/**
 * design/critters-draw-2.js `A.bug` branch `v === 'cicada'` (Nice). The unmirrored wing vein is
 * drawn twice (once per forEach iteration, since the design hard-codes the literal instead of using
 * the loop's own `p`) plus once mirrored — an op-order quirk kept exactly as authored.
 */
export function drawCicada(sink: OpSink, options: KindDrawOptions, colors: ArchetypeColors): void {
  // Epic pose (design gives `bug` no pose of its own): wings flare up and out.
  const epicPose = isEpicPose(options.pose);
  const wing: Point[] = epicPose
    ? [
        [42, 44],
        [16, 40],
        [6, 60],
        [16, 85],
        [32, 88],
        [45, 70],
      ]
    : [
        [42, 44],
        [26, 52],
        [19, 72],
        [25, 93],
        [36, 91],
        [45, 70],
      ];
  const vein: Point[] = [
    [40, 50],
    [30, 70],
    [30, 88],
  ];
  for (const p of [wing, mirrorX(wing)]) {
    W(sink, p, '#e2f4ff', 2);
    sink.line(vein, { w: 1.1 });
  }
  sink.line(mirrorX(vein), { w: 1.1 });

  const body = blobPolygon(50, 64, 13, 23, 0.9, 14);
  const head = blobPolygon(50, 36, 21, 12, 0.8, 16);
  sink.wash(body, colors.f);
  sink.wash(head, colors.f);
  for (const y of [70, 77, 84]) {
    sink.line(
      [
        [44, y],
        [50, y + 1.5],
        [56, y],
      ],
      { w: 1.4, color: colors.dk },
    );
  }
  sink.line(body, { w: 2.4, close: true });
  sink.line(head, { w: 2.6, close: true });
  eyes(
    sink,
    options,
    [
      [35, 33],
      [65, 33],
    ],
    5.6,
  );
  drawSmile(sink, 50, 40, 4, 2);
  drawCheekDots(
    sink,
    [
      [42, 42],
      [58, 42],
    ],
    2.4,
  );
  extras(sink, options);
}

/** design/critters-draw-2.js `A.bug` branch `v === 'hopper'` (Oaxaca). */
export function drawHopper(sink: OpSink, options: KindDrawOptions, colors: ArchetypeColors): void {
  const epicPose = isEpicPose(options.pose);
  const legColor = '#ff5a3d';
  const hindLeg: Point[] = [
    [36, 64],
    [18, 46],
    [13, 62],
    [11, 90],
  ];
  for (const p of [hindLeg, mirrorX(hindLeg)]) {
    sink.stroke(p, colors.f, 6);
    sink.line(p, { w: 2.2 });
  }
  const body = blobPolygon(50, 66, 17, 22, 0.9, 14);
  const head = blobPolygon(50, 37, 19, 16, 0.85, 16);
  sink.wash(body, colors.f);
  sink.wash(head, colors.f);
  sink.fill(ellipsePolygon(50, 70, 9, 13, 10), colors.bl);
  for (const y of [62, 70, 78]) {
    sink.line(
      [
        [42, y],
        [50, y + 1.5],
        [58, y],
      ],
      { w: 1.3, color: colors.dk },
    );
  }
  sink.line(body, { w: 2.4, close: true });
  sink.line(head, { w: 2.6, close: true });
  // Epic pose (design gives `bug` no pose of its own): antennae splay wider, tips marked.
  const antennae: readonly [Point, Point, Point][] = epicPose
    ? [
        [[44, 23], [30, 6], [16, 2]],
        [[56, 23], [70, 6], [84, 2]],
      ]
    : [
        [[44, 23], [38, 8], [30, 3]],
        [[56, 23], [62, 8], [70, 3]],
      ];
  for (const l of antennae) {
    sink.line(l, { w: 1.7 });
    if (epicPose) sink.dot(l[2][0], l[2][1], 2.6, legColor);
  }
  for (const l of [
    [[40, 60], [32, 70]],
    [[60, 60], [68, 70]],
  ] as const) {
    sink.line(l, { w: 2, color: legColor });
  }
  eyes(
    sink,
    options,
    [
      [41, 35],
      [59, 35],
    ],
    5.6,
  );
  drawSmile(sink, 50, 44, 4, 2);
  drawCheekDots(
    sink,
    [
      [34, 43],
      [66, 43],
    ],
    2.8,
  );
  extras(sink, options);
}
