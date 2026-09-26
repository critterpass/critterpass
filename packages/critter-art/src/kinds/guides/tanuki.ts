import type { Point } from '../../core/geometry';
import { ellipsePolygon } from '../../core/shapes';
import type { KindFn } from '../registry';
import { cheeks, eyes, extras } from '../parts/face';

/** design/doodles.js `K.tanuki`. */
export const tanuki: KindFn = (sink, options) => {
  const fill = options.fill ?? '#ff9a4d';
  const dark = options.spot ?? '#6b3a24';
  const belly = options.belly ?? '#fff1dc';
  const pose = options.pose ?? 'idle';

  const tail: Point[] = [
    [66, 80],
    [77, 87.5],
    [88, 82],
    [92, 70],
    [87, 61],
    [79, 62],
    [74, 70],
  ];
  const tailOutline: Point[] = [
    [71.5, 84.5],
    [78, 87.5],
    [88, 82],
    [92, 70],
    [87, 61],
    [79, 62],
    [73, 68],
  ];
  const body: Point[] = [
    [37, 49],
    [29, 61],
    [28, 77],
    [37, 88],
    [63, 88],
    [72, 77],
    [71, 61],
    [63, 49],
  ];
  const head: Point[] = [
    [24, 33],
    [28, 20],
    [40, 13],
    [60, 13],
    [72, 20],
    [76, 33],
    [70, 45],
    [50, 50],
    [30, 45],
  ];
  const earL: Point[] = [
    [30, 23],
    [27, 8],
    [42, 15],
  ];
  const earR: Point[] = [
    [70, 23],
    [73, 8],
    [58, 15],
  ];

  let armL: Point[] = [
    [35, 58],
    [27, 66],
  ];
  let armR: Point[] = [
    [65, 58],
    [73, 66],
  ];
  if (pose === 'wave') armR = [
    [65, 56],
    [74, 47],
    [77, 38],
  ];
  if (pose === 'cheer') {
    armL = [
      [35, 56],
      [26, 47],
      [23, 38],
    ];
    armR = [
      [65, 56],
      [74, 47],
      [77, 38],
    ];
  }
  if (pose === 'think') armR = [
    [65, 58],
    [71, 52],
    [66, 46],
  ];

  sink.wash(tail, fill);
  sink.stroke(
    [
      [85, 62],
      [80, 70],
    ],
    dark,
    3.4,
  );
  sink.stroke(
    [
      [91, 73],
      [82, 77],
    ],
    dark,
    3.4,
  );
  sink.wash(body, fill);
  sink.fill(ellipsePolygon(50, 71, 12.5, 13.5, 12), belly);
  sink.wash(earL, dark);
  sink.wash(earR, dark);
  sink.wash(head, fill);
  sink.fill(ellipsePolygon(37, 31, 11, 7.8, 14, -0.35), dark);
  sink.fill(ellipsePolygon(63, 31, 11, 7.8, 14, 0.35), dark);
  sink.line(tailOutline, { w: 2.4 });
  sink.line(body, { w: 2.4 });
  sink.line(earL, { w: 2.4 });
  sink.line(earR, { w: 2.4 });
  sink.line(head, { w: 2.6, close: true });
  for (const arm of [armL, armR]) sink.line(arm, { w: 2.4 });
  sink.fill(ellipsePolygon(40, 89.5, 6.5, 3.2, 10), dark);
  sink.fill(ellipsePolygon(60, 89.5, 6.5, 3.2, 10), dark);
  eyes(
    sink,
    options,
    [
      [38, 31],
      [62, 31],
    ],
    5.2,
  );
  sink.fill(ellipsePolygon(50, 39.5, 3.8, 2.7, 10), options.ink);
  sink.line(
    [
      [45, 43.5],
      [50, 46],
      [55, 43.5],
    ],
    { w: 2 },
  );
  cheeks(
    sink,
    options,
    [
      [29, 40],
      [71, 40],
    ],
    3,
  );
  const leaf: Point[] = [
    [50, 13.5],
    [44, 6],
    [50, 1.5],
    [57, 5],
  ];
  sink.wash(leaf, options.leaf ?? '#54d6a4', { off: 0.4 });
  sink.line(leaf, { w: 2, close: true });
  extras(sink, options);
};
