import type { Point } from '../../core/geometry';
import { ellipsePolygon } from '../../core/shapes';
import type { KindFn } from '../registry';
import { cheeks, extras, toes } from '../parts/face';

const mirror = (points: readonly Point[]): Point[] => points.map(([x, y]): Point => [100 - x, y]);

/** design/doodles.js `K.axolotl`: bespoke dot eyes (no iris ring, unlike the shared `eyes` helper). */
export const axolotl: KindFn = (sink, options) => {
  const fill = options.fill ?? '#ff9cc8';
  const gillColor = options.spot ?? '#ff4f9a';
  const belly = options.belly ?? '#ffe0ee';
  const pose = options.pose ?? 'idle';

  const head: Point[] = [
    [20, 40],
    [26, 27],
    [40, 20],
    [60, 20],
    [74, 27],
    [80, 40],
    [74, 53],
    [50, 58],
    [26, 53],
  ];
  const body: Point[] = [
    [38, 55],
    [33, 68],
    [38, 81],
    [50, 86],
    [62, 81],
    [67, 68],
    [62, 55],
  ];
  const tail: Point[] = [
    [60, 83],
    [71, 91],
    [84, 88],
    [91, 78],
  ];
  const gillsLeft: Point[][] = [
    [
      [25, 31],
      [16, 22],
      [9, 16],
    ],
    [
      [22, 39],
      [12, 37],
      [4, 35],
    ],
    [
      [23, 47],
      [13, 53],
      [7, 58],
    ],
  ];
  const gills = [...gillsLeft, ...gillsLeft.map(mirror)];

  for (const gill of gills) sink.stroke(gill, gillColor, 6.5);
  sink.stroke(tail, fill, 9);
  sink.wash(body, fill);
  sink.wash(ellipsePolygon(50, 71, 9, 10, 10), belly, { off: 0.5 });
  sink.wash(head, fill);
  for (const gill of gills) sink.line(gill, { w: 1.8 });
  sink.line(head, { w: 2.6, close: true });
  sink.line(body, { w: 2.4 });
  sink.line(tail, { w: 2.4 });

  let armL: Point[] = [
    [39, 62],
    [30, 68],
  ];
  let armR: Point[] = [
    [61, 62],
    [70, 68],
  ];
  if (pose === 'wave') {
    armR = [
      [61, 60],
      [70, 52],
      [72, 44],
    ];
  }
  if (pose === 'cheer') {
    armL = [
      [39, 60],
      [30, 52],
      [28, 44],
    ];
    armR = [
      [61, 60],
      [70, 52],
      [72, 44],
    ];
  }
  const legL: Point[] = [
    [43, 80],
    [37, 88],
  ];
  const legR: Point[] = [
    [57, 80],
    [63, 88],
  ];
  for (const limb of [armL, armR, legL, legR]) {
    sink.line(limb, { w: 2.2 });
    toes(sink, limb, options.ink);
  }

  for (const [x, y] of [
    [36, 37],
    [64, 37],
  ] as const) {
    if (options.closed || pose === 'sleep') {
      sink.line(
        [
          [x - 3.5, y],
          [x, y + 2.4],
          [x + 3.5, y],
        ],
        { w: 2 },
      );
    } else {
      sink.fill(ellipsePolygon(x, y, 3.6, 3.9, 10), options.pupil);
      sink.dot(x - 1.2, y - 1.4, 1.2, options.eye);
      // The closed branch above consumes one seed (`line`) this branch doesn't, so later ribbons
      // would wobble differently across a blink — reserve the same seed here in stable mode.
      if (options.seedMode === 'stable') sink.reserveSeed();
    }
  }
  sink.line(
    [
      [34, 45],
      [50, 51.5],
      [66, 45],
    ],
    { w: 2.2 },
  );
  cheeks(
    sink,
    options,
    [
      [29, 47],
      [71, 47],
    ],
    3.2,
  );
  extras(sink, options);
};
