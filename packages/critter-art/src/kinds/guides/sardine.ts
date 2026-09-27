import type { Point } from '../../core/geometry';
import type { KindFn } from '../registry';
import { cheeks, eyes, extras } from '../parts/face';

/** design/doodles.js `K.sardine`: no pose-conditional geometry, only shared `extras`. */
export const sardine: KindFn = (sink, options) => {
  const fill = options.fill ?? '#9fe0ee';
  const back = options.spot ?? '#3d6fe0';
  const belly = options.belly ?? '#f2fbff';

  const body: Point[] = [
    [13, 52],
    [24, 40],
    [46, 33],
    [68, 35],
    [84, 44],
    [89, 52],
    [83, 60],
    [64, 67],
    [42, 68],
    [22, 62],
  ];
  const tail: Point[] = [
    [16, 52],
    [4, 37],
    [9, 52],
    [4, 67],
  ];
  const finTop: Point[] = [
    [44, 35],
    [51, 23],
    [59, 35],
  ];
  const finBottom: Point[] = [
    [47, 67],
    [53, 77],
    [60, 66],
  ];

  sink.wash(tail, fill);
  sink.wash(finTop, back);
  sink.wash(finBottom, fill);
  sink.wash(body, fill);
  sink.stroke(
    [
      [22, 45],
      [44, 37.5],
      [68, 39],
      [80, 45],
    ],
    back,
    6.5,
  );
  sink.wash(
    [
      [26, 60],
      [44, 64.5],
      [64, 63.5],
      [79, 57],
      [62, 58],
      [42, 58.5],
    ],
    belly,
    { off: 0.4 },
  );
  sink.line(tail, { w: 2.4, close: true });
  sink.line(finTop, { w: 2.2 });
  sink.line(finBottom, { w: 2.2 });
  sink.line(body, { w: 2.6, close: true });
  sink.line(
    [
      [64, 40],
      [60, 52],
      [64, 63],
    ],
    { w: 2 },
  );
  for (const [x, y] of [
    [37, 52],
    [44, 51],
    [51, 50],
  ] as const) {
    sink.dot(x, y, 1.9, options.ink, 0.85);
  }
  eyes(sink, options, [[73, 46.5]], 6.4);
  sink.line(
    [
      [80, 57],
      [84, 59],
      [88, 56.5],
    ],
    { w: 1.9 },
  );
  cheeks(sink, options, [[75, 56.5]], 2.6);
  extras(sink, options);
};
