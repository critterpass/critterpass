import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import { blobPolygon, catmullRomResample, ellipsePolygon, tubeOutline } from '../../../core/shapes';
import { eyes, extras } from '../../parts/face';
import { drawAccessory } from '../parts/accessories';
import { drawCheekDots } from '../helpers';
import { drawSparkExtras, isEpicPose } from '../poses';
import type { ArchetypeFn } from '../types';

const BEAK_SHAPES: Readonly<Record<string, readonly Point[]>> = {
  long: [
    [-8, 0],
    [-28, 4.5],
    [-8, 5],
  ],
  swan: [
    [-8, 0.5],
    [-18, 4],
    [-8, 6],
  ],
  hook: [
    [-8, 0],
    [-21, 1.5],
    [-23.5, 5.5],
    [-20, 4.2],
    [-8, 5],
  ],
  flamingo: [
    [-7, -1.5],
    [-15, 0.5],
    [-19.5, 8],
    [-16.5, 12.5],
    [-12.5, 6.5],
    [-6.5, 5],
  ],
};

/** design/critters-draw-2.js `A.wader`: 9 critters across 4 named variants (swan/float/pelican/flamingo) plus the plain default (egret/stork/heron). */
export const wader: ArchetypeFn = (sink, options, spec, colors) => {
  const epicPose = isEpicPose(options.pose);
  const v = spec.v ?? '';
  const isFloating = v === 'swan' || v === 'float';
  const isPelican = v === 'pelican';
  const isFlamingo = v === 'flamingo';
  const hx = isPelican ? 37 : 35;
  const hy = isFloating ? (v === 'swan' ? 25 : 33) : isPelican ? 30 : 21;
  const hr = isPelican ? 11.5 : 10;

  if (isFloating) {
    sink.line(
      [
        [14, 83],
        [24, 80],
        [34, 83],
        [44, 80],
        [54, 83],
        [64, 80],
        [74, 83],
        [84, 80],
        [92, 83],
      ],
      { w: 2, color: '#6fa8ff' },
    );
    sink.line(
      [
        [30, 90],
        [40, 88],
        [50, 90],
        [60, 88],
        [70, 90],
      ],
      { w: 1.6, color: '#6fa8ff' },
    );
  } else {
    const legColor = spec.lc || '#ff9a4d';
    const legs: readonly [Point, Point, Point][] = isFlamingo
      ? [
          [
            [53, 71],
            [52, 84],
            [53, 96],
          ],
          [
            [58, 71],
            [66, 79],
            [57, 82],
          ],
        ]
      : [
          [
            [51, 70],
            [49, 83],
            [51, 95],
          ],
          [
            [59, 70],
            [61, 83],
            [59, 95],
          ],
        ];
    for (const leg of legs) sink.line(leg, { w: 2.3, color: legColor, taper: false });
    const feet: readonly Point[] = isFlamingo
      ? [[53, 96]]
      : [
          [51, 95],
          [59, 95],
        ];
    for (const [x, y] of feet) {
      sink.line(
        [
          [x - 4.5, y + 0.5],
          [x, y - 0.5],
          [x + 4.5, y + 0.5],
        ],
        { w: 2, color: legColor, taper: false },
      );
    }
  }

  const body: Point[] = isFloating
    ? [
        [24, 72],
        [28, 60],
        [42, 54],
        [62, 54],
        [80, 47],
        [88, 50],
        [85, 63],
        [74, 74],
        [54, 78],
        [34, 78],
      ]
    : [
        [31, 62],
        [37, 52],
        [53, 48],
        [70, 50],
        [87, 42],
        [84, 55],
        [75, 66],
        [58, 72],
        [42, 71],
      ];
  const neckCurve: Point[] =
    v === 'swan'
      ? [
          [42, 58],
          [33, 50],
          [29, 41],
          [32, 33],
          [hx + 1, hy + 7],
        ]
      : isPelican
        ? [
            [46, 54],
            [41, 45],
            [hx + 2, hy + 9],
          ]
        : v === 'float'
          ? [
              [46, 58],
              [40, 49],
              [hx + 2, hy + 8],
            ]
          : isFlamingo
            ? [
                [42, 54],
                [33, 46],
                [35, 36],
                [41, 30],
                [hx + 2, hy + 8],
              ]
            : [
                [42, 54],
                [36, 45],
                [37, 36],
                [hx + 2, hy + 8],
              ];
  const neckWidth: readonly [number, number] = isPelican
    ? [13, 11]
    : v === 'swan'
      ? [9, 7.5]
      : v === 'float'
        ? [10, 8.5]
        : [8, 6.5];
  const neck = tubeOutline(catmullRomResample(neckCurve, 3), neckWidth[0], neckWidth[1]);
  if (!isFloating) {
    W(
      sink,
      [
        [82, 45],
        [94, 42],
        [89, 51],
      ],
      colors.dk,
      1.9,
    );
  }
  sink.wash(body, colors.f);
  sink.wash(neck.polygon, colors.f);
  const head = blobPolygon(hx, hy, hr, hr * 0.92, 0.85, 14);
  sink.wash(head, colors.f);
  // Epic pose (design gives `wader` no pose of its own): the wing lifts as if flapping.
  const wingLift = epicPose ? 7 : 0;
  const restingWing: Point[] = isFloating
    ? [
        [44, 60],
        [60, 56],
        [78, 54],
        [74, 66],
        [56, 70],
      ]
    : [
        [44, 57],
        [60, 53],
        [80, 50],
        [74, 62],
        [58, 66],
      ];
  const wing: Point[] = restingWing.map(([x, y]): Point => [x, y - wingLift]);
  sink.fill(wing, colors.dk);
  sink.line([...body.slice(2), ...body.slice(0, 2)], { w: 2.5 });
  sink.line(wing, { w: 1.8, close: true });
  if (epicPose) {
    const wingTip = pointAt(wing, 2);
    drawSparkExtras(sink, wingTip[0] + 4, wingTip[1] - 4, 5, colors.dk);
  }
  const n = neck.left.length;
  sink.line(neck.left.slice(1, n - 1), { w: 2.3 });
  sink.line(neck.right.slice(1, n - 1), { w: 2.3 });
  sink.line(head, { w: 2.4, close: true });
  if (spec.crest) {
    sink.line(
      [
        [hx + 7, hy - 5],
        [hx + 16, hy - 4],
        [hx + 22, hy],
      ],
      { w: 1.8 },
    );
    sink.line(
      [
        [hx + 7, hy - 3],
        [hx + 14, hy],
        [hx + 19, hy + 4],
      ],
      { w: 1.5 },
    );
  }
  const beakColor = spec.bc || '#ff9a4d';
  if (spec.beak === 'pouch') {
    F(
      sink,
      [
        [hx - 9, hy + 4.5],
        [hx - 31, hy + 5.5],
        [hx - 23, hy + 14],
        [hx - 11, hy + 11],
      ],
      '#ffc46b',
      2,
    );
    F(
      sink,
      [
        [hx - 9, hy + 0.5],
        [hx - 32, hy + 2.5],
        [hx - 32, hy + 5.5],
        [hx - 9, hy + 4.5],
      ],
      beakColor,
      2,
    );
  } else {
    const beakShape =
      (spec.beak !== undefined ? BEAK_SHAPES[spec.beak] : undefined) ?? BEAK_SHAPES['long'] ?? [];
    F(
      sink,
      beakShape.map(([x, y]): Point => [hx + x, hy + y]),
      beakColor,
      2,
    );
    if (spec.beak === 'flamingo') {
      sink.fill(
        [
          [hx - 19.5, hy + 8],
          [hx - 16.5, hy + 12.5],
          [hx - 14.6, hy + 9],
        ],
        '#2c2750',
      );
    }
    if (spec.beak === 'swan') sink.fill(ellipsePolygon(hx - 8.8, hy + 2, 2.4, 2.8, 8), '#2c2750');
  }
  eyes(
    sink,
    options,
    [
      [hx - 3.9, hy - 1.5],
      [hx + 4.3, hy - 1.5],
    ],
    3.3,
  );
  drawCheekDots(sink, [[hx + 7.5, hy + 4]], 2.2);
  drawAccessory(sink, spec, colors, {
    x: hx + 1,
    y: hy - hr,
    w: hr,
    cy: hy,
    ny: hy + hr,
    nw: 5,
    hx: 0,
    hy: 0,
  });
  extras(sink, options);
};
