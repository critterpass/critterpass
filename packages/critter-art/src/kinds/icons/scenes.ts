import { ellipsePolygon } from '../../core/shapes';
import type { KindFn } from '../registry';

const STROKE = 7;

export const wave: KindFn = (sink) => {
  sink.line(
    [
      [6, 44],
      [20, 32],
      [34, 44],
      [48, 32],
      [62, 44],
      [76, 32],
      [94, 44],
    ],
    { w: STROKE },
  );
  sink.line(
    [
      [6, 68],
      [20, 56],
      [34, 68],
      [48, 56],
      [62, 68],
      [76, 56],
      [94, 68],
    ],
    { w: STROKE },
  );
};

export const temple: KindFn = (sink, options) => {
  const roof = [
    [26, 40],
    [74, 40],
    [66, 26],
    [34, 26],
  ] as const;
  if (options.accent) sink.wash(roof, options.accent);
  sink.line(
    [
      [50, 8],
      [50, 18],
    ],
    { w: 6 },
  );
  sink.line(
    [
      [34, 26],
      [66, 26],
      [74, 40],
      [26, 40],
    ],
    { w: STROKE, close: true },
  );
  sink.line(
    [
      [20, 56],
      [80, 56],
      [70, 42],
    ],
    { w: STROKE },
  );
  sink.line(
    [
      [30, 42],
      [20, 56],
    ],
    { w: STROKE },
  );
  sink.line(
    [
      [28, 58],
      [28, 88],
    ],
    { w: STROKE },
  );
  sink.line(
    [
      [72, 58],
      [72, 88],
    ],
    { w: STROKE },
  );
  sink.line(
    [
      [14, 88],
      [86, 88],
    ],
    { w: STROKE },
  );
};

export const camera: KindFn = (sink, options) => {
  if (options.accent) sink.wash(ellipsePolygon(50, 56, 14, 14, 10), options.accent);
  sink.line(
    [
      [10, 34],
      [34, 34],
      [40, 22],
      [60, 22],
      [66, 34],
      [90, 34],
      [90, 80],
      [10, 80],
    ],
    { w: STROKE, close: true },
  );
  sink.line(ellipsePolygon(50, 56, 15, 15, 12), { w: 6, close: true });
};

export const food: KindFn = (sink, options) => {
  const bowl = [
    [10, 50],
    [90, 50],
    [78, 76],
    [22, 76],
  ] as const;
  if (options.accent) sink.wash(bowl, options.accent);
  sink.line(bowl, { w: STROKE, close: true });
  sink.line(
    [
      [30, 84],
      [70, 84],
    ],
    { w: STROKE },
  );
  sink.line(
    [
      [40, 40],
      [36, 22],
      [42, 12],
    ],
    { w: 5, taper: true },
  );
  sink.line(
    [
      [58, 40],
      [62, 22],
      [56, 12],
    ],
    { w: 5, taper: true },
  );
};

export const check: KindFn = (sink) => {
  sink.line(
    [
      [14, 52],
      [40, 78],
      [88, 20],
    ],
    { w: 10, taper: true },
  );
};

export const heart: KindFn = (sink, options) => {
  const points = [
    [50, 86],
    [16, 54],
    [12, 32],
    [28, 16],
    [50, 30],
    [72, 16],
    [88, 32],
    [84, 54],
  ] as const;
  sink.wash(points, options.accent ?? '#ec8f72');
  sink.line(points, { w: 6, close: true });
};
