import type { Point } from '../../core/geometry';
import { ellipsePolygon } from '../../core/shapes';
import type { KindFn } from '../registry';
import { cheeks, eyes, extras } from '../parts/face';

/** design/doodles.js `K.alpaca`: no pose-conditional geometry, only shared `extras`. */
export const alpaca: KindFn = (sink, options) => {
  const fill = options.fill ?? '#fff1d6';
  const fleece = options.belly ?? '#fffaf0';
  const scarfColor = options.spot ?? '#ff5fa8';

  const body: Point[] = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * 6.283;
    const r = 1 + 0.07 * Math.abs(Math.sin(a * 5));
    body.push([50 + Math.cos(a) * 27 * r, 72 + Math.sin(a) * 14 * r]);
  }
  const bodyOutline = [...body.slice(20), ...body.slice(0, 14)];

  const head: Point[] = [
    [37, 22],
    [35, 38],
    [40, 52],
    [60, 52],
    [65, 38],
    [63, 22],
  ];

  const pom: Point[] = [];
  for (let i = 0; i < 16; i++) {
    const a = Math.PI + (i / 15) * Math.PI;
    const r = 1 + 0.1 * Math.abs(Math.sin(a * 4));
    pom.push([50 + Math.cos(a) * 16 * r, 22 + Math.sin(a) * 12 * r]);
  }
  pom.push([60, 26], [40, 26]);

  const earL: Point[] = [
    [38, 18],
    [31, 4],
    [43, 11],
  ];
  const earR: Point[] = [
    [62, 18],
    [69, 4],
    [57, 11],
  ];
  const legs: Point[][] = [
    [
      [34, 83],
      [34, 95],
    ],
    [
      [44, 85],
      [44, 96],
    ],
    [
      [56, 85],
      [56, 96],
    ],
    [
      [66, 83],
      [66, 95],
    ],
  ];

  for (const leg of legs) sink.stroke(leg, fill, 6);
  sink.wash(body, fill);
  sink.wash(earL, fill);
  sink.wash(earR, fill);
  sink.wash(head, fill);
  sink.wash(pom, fleece, { off: 0.5 });
  sink.wash(ellipsePolygon(50, 45, 8, 5.5, 10), '#ffe0c2', { off: 0.3 });
  const scarf: Point[] = [
    [38, 51],
    [62, 51],
    [64, 59],
    [36, 59],
  ];
  const scarfTail: Point[] = [
    [55, 57],
    [59, 72],
    [66, 70],
    [62, 57],
  ];
  sink.wash(scarfTail, scarfColor, { off: 0.4 });
  sink.wash(scarf, scarfColor, { off: 0.4 });
  for (const leg of legs) sink.line(leg, { w: 2.3 });
  sink.line(bodyOutline, { w: 2.4 });
  sink.line(earL, { w: 2.2 });
  sink.line(earR, { w: 2.2 });
  sink.line(head, { w: 2.5 });
  sink.line(pom, { w: 2.3, close: true });
  sink.line(scarf, { w: 2, close: true });
  sink.line(scarfTail, { w: 2 });
  sink.line(
    [
      [37.5, 55],
      [62.5, 55],
    ],
    { w: 1.6, color: options.stripe ?? '#ffd84a' },
  );
  eyes(
    sink,
    options,
    [
      [43, 33],
      [57, 33],
    ],
    4.6,
  );
  sink.line(
    [
      [47, 44],
      [50, 46.5],
      [53, 44],
    ],
    { w: 1.8 },
  );
  sink.line(
    [
      [50, 46.5],
      [50, 49],
    ],
    { w: 1.6 },
  );
  cheeks(
    sink,
    options,
    [
      [38.5, 42.5],
      [61.5, 42.5],
    ],
    2.8,
  );
  extras(sink, options);
};
