import type { Point } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import { blobPolygon, ellipsePolygon, superellipseArc } from '../../../core/shapes';
import { CREAM_WHITE, CRITTER_INK, heartPolygon } from '../helpers';
import type { ArchetypeFn } from '../types';
import { drawBirdPreWashDecorations } from './bird-decorations';
import { drawBirdFace } from './bird-face';
import type { BirdContext } from './bird-face';

/**
 * design/critters-draw-2.js `A.bird`: 24 critters across 17 named variants plus the plain default.
 * Split at the point the design itself pivots from body decoration to face/wing/feet detail —
 * `drawBirdFace` (bird-face.ts) continues in the same op order.
 */
export const bird: ArchetypeFn = (sink, options, spec, colors) => {
  const v = spec.v ?? '';
  const pose = options.pose ?? 'idle';
  const isRaptor = v === 'raptor';

  let body: Point[] = [
    [50, 15],
    [33, 23],
    [25, 43],
    [26, 66],
    [36, 85],
    [64, 85],
    [74, 66],
    [75, 43],
    [67, 23],
  ];
  let ex = 8.5;
  let ey = 36;
  let er = 4.6;
  let by = 0;
  if (v === 'owl') {
    body = blobPolygon(50, 54, 28, 34, 0.82, 16);
    ey = 41;
    er = 7;
    by = 5;
  }
  if (v === 'kiwi') {
    body = blobPolygon(52, 62, 32, 26, 0.86, 16);
    ey = 51;
    er = 4;
    by = 14;
    ex = 9;
  }
  if (v === 'penguin') {
    body = [
      [50, 12],
      [34, 20],
      [27, 42],
      [27, 68],
      [35, 87],
      [65, 87],
      [73, 68],
      [73, 42],
      [66, 20],
    ];
  }
  if (v === 'humming') {
    body = blobPolygon(50, 56, 19, 26, 0.9, 14);
    ey = 42;
    er = 4.3;
    by = 5;
    ex = 7.5;
  }
  let wingColor = spec.wc || colors.dk;
  if (v === 'magpie') wingColor = '#5b8fff';
  if (v === 'goldfinch') wingColor = CRITTER_INK;

  drawBirdPreWashDecorations(sink, spec, colors, v, isRaptor);

  sink.wash(body, colors.f);
  if (!['penguin', 'magpie', 'owl', 'kiwi', 'humming', 'hornbill'].includes(v)) {
    sink.fill(ellipsePolygon(50, 66, 15, 16, 12), colors.bl);
  }
  if (v === 'penguin') {
    sink.fill(blobPolygon(50, 62, 17, 23, 0.85, 14), colors.bl);
    sink.fill(ellipsePolygon(41, 36, 8.5, 8, 12), colors.bl);
    sink.fill(ellipsePolygon(59, 36, 8.5, 8, 12), colors.bl);
    sink.line(superellipseArc(50, 58, 16, 9, 1, 3.5, 5.92, 10), { w: 2.4, color: colors.f });
    sink.dot(35.5, 31, 2.4, '#ff8fae', 0.9);
    sink.dot(64.5, 31, 2.4, '#ff8fae', 0.9);
  }
  if (v === 'magpie' || v === 'hornbill') {
    sink.fill(blobPolygon(50, 68, 14, 15, 0.85, 12), colors.bl);
    if (v === 'magpie') {
      for (const [x, y] of [
        [29, 55],
        [71, 55],
      ] as const) {
        sink.fill(ellipsePolygon(x, y, 3.6, 7, 10), CREAM_WHITE);
      }
    } else {
      sink.fill(ellipsePolygon(41, 36, 6.4, 6, 10), CREAM_WHITE);
      sink.fill(ellipsePolygon(59, 36, 6.4, 6, 10), CREAM_WHITE);
    }
  }
  if (v === 'kiwi') {
    for (const [x, y] of [
      [36, 52], [44, 44], [60, 42], [70, 50], [74, 64], [66, 76], [38, 74], [30, 64], [52, 36],
    ] as const) {
      sink.line(
        [
          [x, y],
          [x + 1.6, y + 3],
        ],
        { w: 1.3, color: colors.dk },
      );
    }
  }
  if (v === 'owl') {
    sink.fill(ellipsePolygon(40, 41, 10.5, 10.5, 12), colors.bl);
    sink.fill(ellipsePolygon(60, 41, 10.5, 10.5, 12), colors.bl);
    for (const [x, y] of [
      [34, 62], [44, 70], [58, 64], [66, 72], [40, 80], [60, 80], [50, 20], [42, 24], [58, 24],
    ] as const) {
      sink.dot(x, y, 1.6, CREAM_WHITE);
    }
  }
  if (v === 'pigeon') {
    sink.fill(
      [
        [31, 47],
        [50, 53],
        [69, 47],
        [70, 54],
        [50, 60],
        [30, 54],
      ],
      '#7fd3ae',
    );
    sink.fill(
      [
        [32, 53],
        [50, 59.5],
        [68, 53],
        [66, 58],
        [50, 64],
        [34, 58],
      ],
      '#b99ae8',
    );
  }
  if (v === 'bulbul') {
    W(
      sink,
      [
        [41, 22],
        [45, 3],
        [50, 12],
        [57, 20],
      ],
      colors.dk,
      1.8,
    );
    sink.fill(ellipsePolygon(35.5, 44, 3.4, 2.8, 10), '#ff4a3d');
    sink.fill(ellipsePolygon(64.5, 44, 3.4, 2.8, 10), '#ff4a3d');
    sink.fill(ellipsePolygon(50, 80, 7, 4, 10), '#ff6a5a');
  }
  if (v === 'goldfinch') {
    sink.fill(blobPolygon(50, 43, 13, 8.5, 0.85, 12), '#ff4a3d');
    sink.fill(
      [
        [34, 25],
        [50, 17],
        [66, 25],
        [62, 30],
        [50, 27.5],
        [38, 30],
      ],
      CRITTER_INK,
    );
  }
  if (v === 'duck' || spec.pat === 'mallard') {
    sink.fill(blobPolygon(50, 31, 21, 15.5, 0.85, 14), '#3fae7a');
    sink.stroke(
      [
        [32, 45],
        [50, 49.5],
        [68, 45],
      ],
      CREAM_WHITE,
      2.4,
    );
    sink.fill(ellipsePolygon(50, 57, 13, 6.5, 10), '#b86a3f');
  }
  if (v === 'pheasant') {
    sink.fill(blobPolygon(50, 31, 21, 15.5, 0.85, 14), '#3fae7a');
    sink.fill(ellipsePolygon(41.5, 36, 6.8, 6.2, 10), '#ff4a3d');
    sink.fill(ellipsePolygon(58.5, 36, 6.8, 6.2, 10), '#ff4a3d');
    sink.stroke(
      [
        [33, 46],
        [50, 50.5],
        [67, 46],
      ],
      CREAM_WHITE,
      2.6,
    );
    for (const [x, y] of [
      [40, 62],
      [50, 70],
      [60, 62],
      [44, 78],
      [56, 78],
    ] as const) {
      sink.line(superellipseArc(x, y, 3, 2.4, 1, 0.3, 2.84, 5), { w: 1.3, color: colors.dk });
    }
  }
  if (spec.pat === 'whitehead') sink.fill(blobPolygon(50, 35, 21, 17, 0.85, 14), CREAM_WHITE);
  if (spec.pat === 'barred') {
    for (const y of [58, 64, 70, 76]) {
      sink.line(
        [
          [41, y],
          [50, y + 1.5],
          [59, y],
        ],
        { w: 1.4, color: colors.dk },
      );
    }
  }

  if (spec.pat === 'hearts') {
    for (const [x, y, r, color] of [
      [39, 62, 4, '#ff5a4d'],
      [60, 67, 3.6, '#ffd84a'],
      [49, 77, 3.2, '#ff8fbf'],
    ] as const) {
      F(sink, heartPolygon(x, y, r), color, 1.3);
    }
  }

  const context: BirdContext = { v, pose, isRaptor, wingColor, body, ex, ey, er, by };
  drawBirdFace(sink, options, spec, colors, context);
};
