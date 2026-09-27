import { ellipsePolygon } from '../../core/shapes';
import type { KindFn } from '../registry';

const STROKE = 7;

/** design/doodles.js `K.egg`: only icon with a pose (`crack`). */
export const egg: KindFn = (sink, options) => {
  const outline = [
    [50, 8],
    [31, 22],
    [22, 48],
    [27, 74],
    [50, 91],
    [73, 74],
    [78, 48],
    [69, 22],
  ] as const;
  sink.wash(outline, options.fill ?? '#fff1d6');
  for (const [x, y, rx, ry] of [
    [40, 36, 7, 5],
    [62, 58, 9, 6.5],
    [58, 26, 4.5, 3.5],
    [36, 66, 5.5, 4.2],
  ] as const) {
    sink.wash(ellipsePolygon(x, y, rx, ry, 10), options.spot ?? '#ff9a4d', { off: 0.4 });
  }
  sink.line(outline, { w: 3, close: true });
  if (options.pose === 'crack') {
    sink.line(
      [
        [25, 50],
        [35, 44],
        [42, 53],
        [50, 43],
        [58, 53],
        [65, 44],
        [75, 50],
      ],
      { w: 2.6 },
    );
  }
};

export const star: KindFn = (sink, options) => {
  const points: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 19 : 42;
    points.push([50 + Math.cos(a) * r, 54 + Math.sin(a) * r]);
  }
  sink.wash(points, options.accent ?? '#ffd84a');
  sink.line(points, { w: 6, close: true });
};

export const flame: KindFn = (sink, options) => {
  const outline = [
    [50, 6],
    [66, 28],
    [76, 52],
    [71, 75],
    [50, 92],
    [29, 75],
    [24, 52],
    [36, 34],
    [44, 46],
  ] as const;
  sink.wash(outline, options.accent ?? '#ff9a4d');
  sink.wash(
    [
      [50, 48],
      [59, 63],
      [57, 78],
      [50, 83],
      [43, 78],
      [41, 63],
    ],
    options.fill ?? '#ffd84a',
    { off: 0.4 },
  );
  sink.line(outline, { w: 6, close: true });
};

export const lock: KindFn = (sink, options) => {
  const body = [
    [22, 46],
    [78, 46],
    [78, 88],
    [22, 88],
  ] as const;
  if (options.accent) sink.wash(body, options.accent);
  sink.line(body, { w: STROKE, close: true });
  sink.line(
    [
      [34, 46],
      [34, 30],
      [50, 16],
      [66, 30],
      [66, 46],
    ],
    { w: STROKE },
  );
  sink.dot(50, 64, 6, options.ink);
};

export const chat: KindFn = (sink, options) => {
  const bubble = [
    [12, 20],
    [88, 20],
    [88, 66],
    [46, 66],
    [26, 84],
    [30, 66],
    [12, 66],
  ] as const;
  if (options.accent) sink.wash(bubble, options.accent);
  sink.line(bubble, { w: STROKE, close: true });
  for (const x of [34, 50, 66]) sink.dot(x, 43, 5, options.ink);
};

export const cal: KindFn = (sink, options) => {
  const body = [
    [12, 22],
    [88, 22],
    [88, 86],
    [12, 86],
  ] as const;
  if (options.accent) sink.wash(body, options.accent);
  sink.line(body, { w: STROKE, close: true });
  sink.line(
    [
      [12, 40],
      [88, 40],
    ],
    { w: 6 },
  );
  sink.line(
    [
      [32, 10],
      [32, 28],
    ],
    { w: 6 },
  );
  sink.line(
    [
      [68, 10],
      [68, 28],
    ],
    { w: 6 },
  );
  for (const [x, y] of [
    [32, 56],
    [50, 56],
    [68, 56],
    [32, 72],
    [50, 72],
  ] as const) {
    sink.dot(x, y, 4.5, options.ink);
  }
};
