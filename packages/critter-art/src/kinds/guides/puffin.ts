import type { Point } from '../../core/geometry';
import { ellipsePolygon } from '../../core/shapes';
import type { KindFn } from '../registry';
import { cheeks, eyes, extras } from '../parts/face';

/** design/doodles.js `K.puffin`. */
export const puffin: KindFn = (sink, options) => {
  const fill = options.fill ?? '#3d6fe0';
  const crown = options.belly ?? '#fff6e6';
  const beakDark = options.spot ?? '#ff9a4d';
  const pose = options.pose ?? 'idle';

  const body: Point[] = [
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
  const face: Point[] = [
    [36, 28],
    [50, 23.5],
    [64, 28],
    [69, 40],
    [63, 50],
    [50, 54],
    [37, 50],
    [31, 40],
  ];
  let wingL: Point[] = [
    [28, 47],
    [19, 61],
    [25, 75],
  ];
  let wingR: Point[] = [
    [72, 47],
    [81, 61],
    [75, 75],
  ];
  if (pose === 'wave') {
    wingR = [
      [72, 46],
      [84, 37],
      [88, 26],
    ];
  }
  if (pose === 'cheer') {
    wingL = [
      [28, 46],
      [16, 37],
      [12, 26],
    ];
    wingR = [
      [72, 46],
      [84, 37],
      [88, 26],
    ];
  }
  const footL: Point[] = [
    [35, 93],
    [41, 85],
    [47, 93],
  ];
  const footR: Point[] = [
    [53, 93],
    [59, 85],
    [65, 93],
  ];

  sink.wash(footL, beakDark);
  sink.wash(footR, beakDark);
  sink.wash(body, fill);
  sink.fill(face, crown);
  sink.fill(ellipsePolygon(50, 70, 14, 14, 12), crown);
  sink.stroke(wingL, fill, 7);
  sink.stroke(wingR, fill, 7);
  sink.line(body, { w: 2.6, close: true });
  sink.line(wingL, { w: 2.3 });
  sink.line(wingR, { w: 2.3 });
  sink.line(footL, { w: 2, close: true });
  sink.line(footR, { w: 2, close: true });
  eyes(
    sink,
    options,
    [
      [42, 36],
      [58, 36],
    ],
    4.5,
  );
  const beak: Point[] = [
    [43, 44],
    [50, 41.5],
    [57, 44],
    [58.5, 50],
    [50, 61],
    [41.5, 50],
  ];
  sink.fill(beak, beakDark);
  sink.fill(
    [
      [43.5, 44.2],
      [50, 42],
      [56.5, 44.2],
      [57, 46.5],
      [43, 46.5],
    ],
    options.beak2 ?? '#ffd84a',
  );
  sink.line(beak, { w: 2.2, close: true });
  sink.line(
    [
      [44, 51],
      [56, 51],
    ],
    { w: 1.5 },
  );
  cheeks(
    sink,
    options,
    [
      [35, 45],
      [65, 45],
    ],
    2.8,
  );
  extras(sink, options);
};
