import { ellipsePolygon } from '../../core/shapes';
import type { KindFn } from '../registry';

const STROKE = 7;

export const pin: KindFn = (sink, options) => {
  const body = [
    [50, 91],
    [30, 58],
    [26, 36],
    [36, 17],
    [50, 11],
    [64, 17],
    [74, 36],
    [70, 58],
  ] as const;
  if (options.accent) sink.wash(body, options.accent);
  sink.line(body, { w: STROKE, close: true });
  sink.line(ellipsePolygon(50, 37, 9, 9, 10), { w: 6, close: true });
};

export const bed: KindFn = (sink, options) => {
  const blanket = [
    [40, 62],
    [42, 48],
    [86, 50],
    [88, 62],
  ] as const;
  if (options.accent) sink.wash(blanket, options.accent);
  sink.line(
    [
      [12, 80],
      [12, 36],
    ],
    { w: STROKE },
  );
  sink.line(
    [
      [12, 62],
      [88, 62],
      [88, 80],
    ],
    { w: STROKE },
  );
  sink.line(ellipsePolygon(28, 53, 9, 6, 10), { w: 6, close: true });
  sink.line(blanket, { w: STROKE });
};

export const ticket: KindFn = (sink, options) => {
  const body = [
    [10, 28],
    [90, 28],
    [90, 43],
    [84, 50],
    [90, 57],
    [90, 72],
    [10, 72],
    [10, 57],
    [16, 50],
    [10, 43],
  ] as const;
  if (options.accent) sink.wash(body, options.accent);
  sink.line(body, { w: STROKE, close: true });
  sink.line(
    [
      [62, 34],
      [62, 42],
    ],
    { w: 5 },
  );
  sink.line(
    [
      [62, 48],
      [62, 54],
    ],
    { w: 5 },
  );
  sink.line(
    [
      [62, 60],
      [62, 66],
    ],
    { w: 5 },
  );
};

export const boat: KindFn = (sink, options) => {
  if (options.accent) {
    sink.wash(
      [
        [50, 24],
        [76, 52],
        [50, 52],
      ],
      options.accent,
    );
  }
  sink.line(
    [
      [8, 60],
      [92, 60],
      [78, 80],
      [22, 80],
    ],
    { w: STROKE, close: true },
  );
  sink.line(
    [
      [50, 60],
      [50, 16],
    ],
    { w: STROKE },
  );
  sink.line(
    [
      [50, 22],
      [76, 52],
      [50, 52],
    ],
    { w: STROKE },
  );
};

export const wallet: KindFn = (sink, options) => {
  const body = [
    [12, 30],
    [84, 30],
    [84, 78],
    [12, 78],
  ] as const;
  if (options.accent) sink.wash(body, options.accent);
  sink.line(body, { w: STROKE, close: true });
  sink.line(
    [
      [58, 44],
      [92, 44],
      [92, 64],
      [58, 64],
    ],
    { w: 6, close: true },
  );
  sink.dot(68, 54, 4, options.ink);
};

export const bell: KindFn = (sink, options) => {
  const body = [
    [30, 70],
    [32, 40],
    [50, 24],
    [68, 40],
    [70, 70],
  ] as const;
  if (options.accent) sink.wash(body, options.accent);
  sink.line(
    [
      [28, 72],
      [32, 40],
      [50, 24],
      [68, 40],
      [72, 72],
    ],
    { w: STROKE },
  );
  sink.line(
    [
      [18, 72],
      [82, 72],
    ],
    { w: STROKE },
  );
  sink.dot(50, 84, 6, options.ink);
  sink.line(
    [
      [50, 24],
      [50, 14],
    ],
    { w: 6 },
  );
};
