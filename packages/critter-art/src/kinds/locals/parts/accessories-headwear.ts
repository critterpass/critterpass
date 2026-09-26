import { CREAM_WHITE, CRITTER_INK } from '../helpers';
import { F, W } from '../../../core/ops';
import { blobPolygon, ellipsePolygon, fluffPolygon } from '../../../core/shapes';
import type { AccessoryFn } from './accessories-types';

// design/critters-draw-1.js `ACC`: hats. `flowers` (a bouquet, not headwear) lives in
// accessories-nature-and-props.ts with the rest of the botanical accents.

export const beret: AccessoryFn = (sink, a) => {
  F(sink, blobPolygon(a.x + a.w * 0.12, a.y + 1.5, a.w * 0.64, a.w * 0.2, 0.75, 12), '#3a3466', 2);
  sink.line(
    [
      [a.x + a.w * 0.12, a.y - a.w * 0.16],
      [a.x + a.w * 0.2, a.y - a.w * 0.34],
    ],
    { w: 2.2 },
  );
};

export const crown: AccessoryFn = (sink, a) => {
  const w = a.w * 0.42;
  const y = a.y + 2.5;
  F(
    sink,
    [
      [a.x - w, y],
      [a.x - w * 1.12, y - w * 0.95],
      [a.x - w * 0.5, y - w * 0.42],
      [a.x, y - w * 1.15],
      [a.x + w * 0.5, y - w * 0.42],
      [a.x + w * 1.12, y - w * 0.95],
      [a.x + w, y],
    ],
    '#ffd84a',
    2,
  );
  sink.dot(a.x, y - w * 0.36, 1.7, '#ff5fa8');
};

export const nonla: AccessoryFn = (sink, a) => {
  const w = a.w * 1.35;
  W(
    sink,
    [
      [a.x - w, a.y + 5],
      [a.x, a.y - w * 0.72],
      [a.x + w, a.y + 5],
      [a.x, a.y + 7.5],
    ],
    '#f2d58a',
    2.1,
  );
  for (const u of [-0.42, 0.42]) {
    sink.line(
      [
        [a.x, a.y - w * 0.72],
        [a.x + w * u, a.y + 6.2],
      ],
      { w: 1.2 },
    );
  }
};

export const boater: AccessoryFn = (sink, a) => {
  const w = a.w * 0.85;
  const y = a.y + 3;
  const brim = [
    [a.x - w * 0.58, y],
    [a.x - w * 0.54, y - w * 0.52],
    [a.x + w * 0.54, y - w * 0.52],
    [a.x + w * 0.58, y],
  ] as const;
  F(sink, blobPolygon(a.x, y, w, w * 0.2, 0.8, 12), '#f2d58a', 2);
  sink.fill(brim, '#f2d58a');
  sink.fill(
    [
      [a.x - w * 0.575, y - w * 0.1],
      [a.x + w * 0.575, y - w * 0.1],
      [a.x + w * 0.565, y - w * 0.26],
      [a.x - w * 0.565, y - w * 0.26],
    ],
    '#ff5a4d',
  );
  sink.line(brim, { w: 2 });
};

export const sailor: AccessoryFn = (sink, a) => {
  const w = a.w * 0.72;
  const y = a.y + 4;
  F(
    sink,
    [
      [a.x - w, y],
      [a.x - w * 0.92, y - w * 0.55],
      [a.x, y - w * 0.72],
      [a.x + w * 0.92, y - w * 0.55],
      [a.x + w, y],
    ],
    '#33407a',
    2,
  );
  F(
    sink,
    [
      [a.x - w * 0.95, y],
      [a.x + w * 0.95, y],
      [a.x + w * 0.7, y + w * 0.28],
      [a.x - w * 0.7, y + w * 0.28],
    ],
    '#2c2750',
    1.8,
  );
  sink.dot(a.x, y - w * 0.25, 1.8, '#ffd84a');
};

export const bollen: AccessoryFn = (sink, a) => {
  const w = a.w * 0.82;
  const y = a.y + 3;
  F(sink, blobPolygon(a.x, y, w, w * 0.22, 0.8, 12), CREAM_WHITE, 2);
  for (const [u, v] of [
    [-0.5, -0.28],
    [0, -0.4],
    [0.5, -0.28],
    [-0.25, -0.62],
    [0.25, -0.62],
  ] as const) {
    F(sink, ellipsePolygon(a.x + u * w, y + v * w, w * 0.21, w * 0.21, 10), '#ff4a3d', 1.6);
  }
};

export const fez: AccessoryFn = (sink, a) => {
  const w = a.w * 0.45;
  const y = a.y + 3;
  F(
    sink,
    [
      [a.x - w, y],
      [a.x - w * 0.78, y - w * 1.25],
      [a.x + w * 0.78, y - w * 1.25],
      [a.x + w, y],
    ],
    '#e8453c',
    2,
  );
  sink.line(
    [
      [a.x, y - w * 1.25],
      [a.x + w * 0.9, y - w * 0.7],
      [a.x + w, y - w * 0.1],
    ],
    { w: 1.6 },
  );
  sink.dot(a.x + w, y, 1.6, CRITTER_INK);
};

export const hood: AccessoryFn = (sink, a) => {
  const w = a.w * 0.6;
  const y = a.y + 6;
  F(
    sink,
    [
      [a.x - w, y + w * 0.2],
      [a.x - w * 0.82, y - w * 0.45],
      [a.x, y - w * 0.72],
      [a.x + w * 0.82, y - w * 0.45],
      [a.x + w, y + w * 0.2],
      [a.x, y + w * 0.05],
    ],
    '#a0602f',
    2,
  );
  sink.line(
    [
      [a.x, y - w * 0.72],
      [a.x - 0.5, y - w * 1.2],
    ],
    { w: 1.8 },
  );
  F(sink, fluffPolygon(a.x - 0.5, y - w * 1.35, 2.8, 3.4, 4, 0.4), '#ffd84a', 1.4);
};

export const shades: AccessoryFn = (sink, a) => {
  const y = a.y + 5.5;
  for (const u of [-7, 7]) {
    F(sink, blobPolygon(a.x + u, y, 6, 3.6, 0.7, 10), '#3a3466', 1.6);
  }
  sink.line(
    [
      [a.x - 1.5, y - 0.5],
      [a.x + 1.5, y - 0.5],
    ],
    { w: 1.6 },
  );
  sink.dot(a.x - 9, y - 1.2, 1, '#9fd0ff');
  sink.dot(a.x + 5, y - 1.2, 1, '#9fd0ff');
};
