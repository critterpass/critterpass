import { ellipsePolygon } from '../../core/shapes';
import type { KindFn } from '../registry';

const STROKE = 7;

export const sun: KindFn = (sink, options) => {
  const disc = ellipsePolygon(50, 50, 18, 18, 12);
  sink.wash(disc, options.accent ?? '#f2c14e');
  sink.line(disc, { w: STROKE, close: true });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * 6.283;
    sink.line(
      [
        [50 + Math.cos(a) * 29, 50 + Math.sin(a) * 29],
        [50 + Math.cos(a) * 41, 50 + Math.sin(a) * 41],
      ],
      { w: 6 },
    );
  }
};

export const rain: KindFn = (sink, options) => {
  const cloud = [
    [20, 58],
    [18, 44],
    [32, 36],
    [42, 22],
    [62, 24],
    [70, 36],
    [84, 40],
    [84, 56],
  ] as const;
  if (options.accent) sink.wash(cloud, options.accent);
  sink.line(cloud, { w: STROKE, close: true });
  for (const [x, y] of [
    [30, 70],
    [50, 72],
    [70, 70],
  ] as const) {
    sink.line(
      [
        [x, y],
        [x - 5, y + 16],
      ],
      { w: 6 },
    );
  }
};

export const spark: KindFn = (sink, options) => {
  const points = [
    [50, 8],
    [58, 42],
    [92, 50],
    [58, 58],
    [50, 92],
    [42, 58],
    [8, 50],
    [42, 42],
  ] as const;
  sink.wash(points, options.accent ?? '#f2c14e');
  sink.line(points, { w: 6, close: true });
};

export const plane: KindFn = (sink, options) => {
  const body = [
    [10, 52],
    [88, 28],
    [62, 86],
    [50, 60],
  ] as const;
  if (options.accent) sink.wash(body, options.accent);
  sink.line(body, { w: STROKE, close: true });
  sink.line(
    [
      [50, 60],
      [88, 28],
    ],
    { w: 6 },
  );
};

export const car: KindFn = (sink, options) => {
  const body = [
    [10, 64],
    [20, 42],
    [76, 42],
    [90, 64],
    [90, 74],
    [10, 74],
  ] as const;
  if (options.accent) sink.wash(body, options.accent);
  sink.line(body, { w: STROKE, close: true });
  sink.fill(ellipsePolygon(28, 76, 8, 8, 10), options.ink);
  sink.fill(ellipsePolygon(72, 76, 8, 8, 10), options.ink);
};

export const volcano: KindFn = (sink, options) => {
  const body = [
    [8, 84],
    [36, 36],
    [48, 44],
    [62, 34],
    [92, 84],
  ] as const;
  if (options.accent) sink.wash(body, options.accent);
  sink.line(body, { w: STROKE });
  sink.line(
    [
      [46, 26],
      [40, 18],
      [50, 12],
      [44, 4],
    ],
    { w: 5, taper: true },
  );
  sink.line(
    [
      [60, 26],
      [66, 16],
      [60, 8],
    ],
    { w: 5, taper: true },
  );
};
