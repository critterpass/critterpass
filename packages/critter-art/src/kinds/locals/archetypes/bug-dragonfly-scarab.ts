import type { Point } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { blobPolygon, ellipsePolygon, tubeOutline } from '../../../core/shapes';
import { eyes, extras } from '../../parts/face';
import { CREAM_WHITE, drawCheekDots, drawSmile, mirrorX } from '../helpers';
import { isEpicPose } from '../poses';
import type { KindDrawOptions } from '../../registry';
import type { ArchetypeColors } from '../types';

/** design/critters-draw-2.js `A.bug` branch `v === 'dragonfly'` (Plitvice). */
export function drawDragonfly(
  sink: OpSink,
  options: KindDrawOptions,
  colors: ArchetypeColors,
): void {
  // Epic pose (design gives `bug` no pose of its own): all four wings tilt up and spread wider.
  const wingTilt = isEpicPose(options.pose) ? 0.14 : 0;
  for (const [x, y, rx, ry, rot] of [
    [27, 42, 20, 6.5, -0.22 - wingTilt],
    [73, 42, 20, 6.5, 0.22 + wingTilt],
    [28, 55, 18, 6, 0.14 + wingTilt],
    [72, 55, 18, 6, -0.14 - wingTilt],
  ] as const) {
    W(sink, ellipsePolygon(x, y, rx, ry, 14, rot), '#dff6ff', 1.9);
    sink.line(
      [
        [x - rx * 0.8, y - Math.sin(rot) * rx * 0.8],
        [x + rx * 0.8, y + Math.sin(rot) * rx * 0.8],
      ],
      { w: 1 },
    );
  }
  const tail = tubeOutline(
    [
      [50, 50],
      [50, 70],
      [50, 94],
    ],
    8,
    5,
  );
  sink.wash(tail.polygon, colors.f);
  const thorax = blobPolygon(50, 49, 9, 8, 0.85, 12);
  sink.wash(thorax, colors.f);
  sink.line(tail.left, { w: 2.2 });
  sink.line(tail.right, { w: 2.2 });
  for (const y of [62, 70, 78, 86]) {
    sink.line(
      [
        [46.5, y],
        [53.5, y],
      ],
      { w: 1.4 },
    );
  }
  sink.line(thorax, { w: 2.2, close: true });
  const head = blobPolygon(50, 32, 17, 12, 0.85, 14);
  sink.wash(head, colors.f);
  sink.line(head, { w: 2.5, close: true });
  eyes(
    sink,
    options,
    [
      [40, 30],
      [60, 30],
    ],
    6.6,
  );
  drawSmile(sink, 50, 36, 3.5, 1.8);
  drawCheekDots(
    sink,
    [
      [36, 38],
      [64, 38],
    ],
    2.4,
  );
  extras(sink, options);
}

/** design/critters-draw-2.js `A.bug` branch `v === 'scarab'` (Luxor). */
export function drawScarab(sink: OpSink, options: KindDrawOptions, colors: ArchetypeColors): void {
  const epicPose = isEpicPose(options.pose);
  for (const [x, y] of [
    [30, 62],
    [28, 74],
    [32, 84],
  ] as const) {
    const leg = [
      [x + 3, y],
      [x - 5, y + 4],
    ] as const;
    sink.line(leg, { w: 2 });
    sink.line(mirrorX(leg), { w: 2 });
  }
  // Epic pose (design gives `bug` no pose of its own): forelegs raise higher, sun disk grows.
  const forelegs: readonly [Point, Point, Point][] = epicPose
    ? [
        [
          [38, 44],
          [26, 30],
          [32, 18],
        ],
        [
          [62, 44],
          [74, 30],
          [68, 18],
        ],
      ]
    : [
        [
          [38, 44],
          [30, 34],
          [36, 26],
        ],
        [
          [62, 44],
          [70, 34],
          [64, 26],
        ],
      ];
  for (const l of forelegs) sink.line(l, { w: 2.1 });
  F(sink, ellipsePolygon(50, 18, epicPose ? 14 : 12, epicPose ? 13 : 11, 14), '#ffb84d', 2.2);
  for (const [x, y] of [
    [36, 12],
    [64, 12],
    [50, 4],
  ] as const) {
    sink.line(
      [
        [x, y],
        [x + (x - 50) * 0.2, y - 3],
      ],
      { w: 1.8, color: '#ff9a2e' },
    );
  }
  const body = blobPolygon(50, 65, 24, 22, 0.85, 16);
  const head = blobPolygon(50, 41, 15, 9.5, 0.85, 14);
  sink.wash(body, colors.f);
  sink.wash(head, colors.dk);
  sink.stroke(
    [
      [38, 56],
      [36, 68],
    ],
    '#9fd0ff',
    3,
  );
  sink.line(body, { w: 2.6, close: true });
  sink.line(
    [
      [50, 48],
      [50, 86],
    ],
    { w: 2 },
  );
  sink.line(head, { w: 2.3, close: true });
  eyes(
    sink,
    options,
    [
      [44, 41],
      [56, 41],
    ],
    3.9,
  );
  drawSmile(sink, 50, 45, 3, 1.4, CREAM_WHITE);
  drawCheekDots(
    sink,
    [
      [39, 46],
      [61, 46],
    ],
    2.2,
  );
  extras(sink, options);
}
