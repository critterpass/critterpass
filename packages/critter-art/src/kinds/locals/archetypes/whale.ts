import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import { W } from '../../../core/ops';
import { blobPolygon, ellipsePolygon } from '../../../core/shapes';
import { eyes, extras } from '../../parts/face';
import { CREAM_WHITE } from '../helpers';
import { drawSparkExtras, isEpicPose } from '../poses';
import type { ArchetypeFn } from '../types';

/** design/critters-draw-2.js `A.whale`: 4 critters across 3 named variants (dolphin/orca/humpback), drawn in profile with a single visible eye. */
export const whale: ArchetypeFn = (sink, options, spec, colors) => {
  const epicPose = isEpicPose(options.pose);
  const isDolphin = spec.v === 'dolphin';
  const isOrca = spec.v === 'orca';
  const isHumpback = spec.v === 'humpback';

  const body: Point[] = isOrca
    ? [
        [8, 56], [12, 44], [26, 37], [46, 35], [64, 37], [78, 44], [88, 53], [88, 58], [76, 62], [56, 67], [34, 69], [18, 66],
      ]
    : isHumpback
      ? [
          [8, 54], [12, 42], [28, 35], [50, 34], [68, 38], [82, 46], [90, 54], [86, 60], [70, 64], [48, 70], [26, 70], [12, 64],
        ]
      : [
          [10, 56], [16, 47], [28, 41], [46, 37], [62, 38], [76, 44], [86, 52], [88, 57], [78, 60], [60, 64], [40, 67], [24, 66], [14, 62],
        ];
  const fluke: Point[] = [
    [84, 52],
    [90, 40],
    [97, 37],
    [94, 48],
    [90, 54],
    [95, 62],
    [98, 71],
    [90, 68],
    [84, 58],
  ];
  const dorsalFin: Point[] = isOrca
    ? [[46, 36], [53, 13], [62, 37]]
    : isHumpback
      ? [[64, 38], [69, 31], [74, 40]]
      : [[48, 38], [57, 24], [64, 39]];
  // T8 epic pose (design gives `whale` no pose of its own): the side fin slaps up out of the water.
  const restingSideFin: Point[] = isHumpback
    ? [[30, 66], [22, 87], [30, 89], [40, 70]]
    : [[34, 64], [30, 76], [42, 67]];
  const sideFin: Point[] = epicPose ? restingSideFin.map(([x, y]): Point => [x, y - 16]) : restingSideFin;
  sink.wash(fluke, colors.f);
  sink.wash(dorsalFin, colors.f);
  if (!isHumpback) sink.wash(sideFin, colors.f);
  const beak: Point[] = [
    [12, 55],
    [3, 57],
    [4, 60],
    [14, 61],
  ];
  if (isDolphin) sink.wash(beak, colors.f);
  sink.wash(body, colors.f);
  if (isOrca) {
    sink.fill(ellipsePolygon(30, 46, 7, 3.4, 10, -0.2), CREAM_WHITE);
    sink.fill(
      [
        [14, 60],
        [30, 66],
        [50, 67],
        [40, 62],
        [24, 60],
      ],
      CREAM_WHITE,
    );
  } else {
    sink.fill(blobPolygon(40, 62, 24, 4.6, 0.8, 12), colors.bl);
  }
  if (isHumpback) {
    for (const [x1, y1, x2, y2] of [
      [18, 60, 40, 66],
      [20, 63, 42, 68.5],
    ] as const) {
      sink.line(
        [
          [x1, y1],
          [x2, y2],
        ],
        { w: 1.3 },
      );
    }
    for (const [x, y] of [
      [20, 42],
      [26, 39],
      [32, 37.5],
    ] as const) {
      sink.dot(x, y, 1.4, colors.dk);
    }
    W(sink, sideFin, colors.bl, 2.1);
    sink.line(
      [
        [20, 30],
        [18, 20],
      ],
      { w: 1.8, color: '#6fa8ff' },
    );
    sink.line(
      [
        [23, 30],
        [27, 20],
      ],
      { w: 1.8, color: '#6fa8ff' },
    );
  }
  sink.line(fluke, { w: 2.3, close: true });
  sink.line(dorsalFin, { w: 2.2 });
  if (!isHumpback) sink.line(sideFin, { w: 2.1 });
  if (isDolphin) sink.line(beak, { w: 2.2 });
  sink.line(body, { w: 2.6, close: true });
  eyes(sink, options, [[isDolphin ? 26 : 25, 50]], isOrca ? 3.8 : 4.4);
  sink.line(
    isDolphin
      ? [
          [13, 60],
          [20, 62.5],
          [27, 60.5],
        ]
      : [
          [11, 58],
          [20, 61.5],
          [30, 59.5],
        ],
    { w: 1.9 },
  );
  sink.dot(34, 57, 2.8, '#ff7fa8', 0.5);
  if (epicPose) {
    const tip = pointAt(sideFin, 1);
    drawSparkExtras(sink, tip[0] - 4, tip[1] - 4, 5, colors.dk);
  }
  extras(sink, options);
};
