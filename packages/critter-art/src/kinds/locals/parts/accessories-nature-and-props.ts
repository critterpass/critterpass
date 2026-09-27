import { CREAM_WHITE, drawBloom, starPolygon } from '../helpers';
import { F } from '../../../core/ops';
import { blobPolygon, ellipsePolygon, fluffPolygon } from '../../../core/shapes';
import type { AccessoryFn } from './accessories-types';

// design/critters-draw-1.js `ACC`: botanical accents (laurel..berries) and hand-held props
// (pizza..balloon) — the two smallest categories, combined to keep every accessory file well
// under the line budget.

export const laurel: AccessoryFn = (sink, a) => {
  for (let i = 0; i < 4; i++) {
    for (const t of [3.55 + i * 0.26, 5.87 - i * 0.26]) {
      const x = a.x + Math.cos(t) * a.w * 0.95;
      const y = a.cy + Math.sin(t) * a.w * 0.78;
      F(sink, ellipsePolygon(x, y, 4, 1.9, 8, t + 1.57), '#6cc46a', 1.3);
    }
  }
};

export const flowers: AccessoryFn = (sink, a) => {
  for (const [u, v, color] of [
    [-0.62, 0.2, '#ff8fbf'],
    [-0.3, -0.1, '#ffd84a'],
    [0, -0.18, CREAM_WHITE],
    [0.3, -0.1, '#ff8fbf'],
    [0.62, 0.2, '#ffd84a'],
  ] as const) {
    drawBloom(sink, a.x + u * a.w, a.y + 3 + v * a.w * 0.5, color, '#ff9a4d');
  }
};

export const edelweiss: AccessoryFn = (sink, a) => {
  const x = a.x + a.w * 0.74;
  const y = a.y + a.w * 0.3;
  F(sink, starPolygon(x, y, 4.8), CREAM_WHITE, 1.4);
  sink.dot(x, y, 1.4, '#ffd84a');
};

export const rose: AccessoryFn = (sink, a) =>
  drawBloom(sink, a.x + a.w * 0.74, a.y + a.w * 0.3, '#ff5a6e', '#c42f4a');

export const marigold: AccessoryFn = (sink, a) => {
  const x = a.x + a.w * 0.74;
  const y = a.y + a.w * 0.3;
  F(sink, fluffPolygon(x, y, 4, 4, 8, 0.3), '#ff9a2e', 1.4);
  sink.dot(x, y, 1.5, '#e0602a');
};

export const orange: AccessoryFn = (sink, a) => {
  F(sink, ellipsePolygon(a.x + 2, a.y - 3, 6.5, 6, 12), '#ffa42e', 2);
  F(sink, ellipsePolygon(a.x + 4.5, a.y - 9.5, 3.2, 1.5, 8, -0.4), '#54b86a', 1.2);
};

export const gumleaf: AccessoryFn = (sink, a) => {
  const x = a.hx;
  const y = a.hy;
  F(sink, ellipsePolygon(x + 2, y - 3, 6.5, 2.6, 10, -0.8), '#7cc46a', 1.5);
  sink.line(
    [
      [x - 2, y + 1],
      [x + 6, y - 7],
    ],
    { w: 1.1 },
  );
};

export const tulip: AccessoryFn = (sink) => {
  sink.line(
    [
      [86, 93],
      [86, 70],
    ],
    { w: 2, color: '#3f9a55' },
  );
  F(sink, ellipsePolygon(82.5, 83, 4, 1.8, 8, -0.9), '#54b86a', 1.3);
  F(
    sink,
    [
      [81, 70],
      [81.5, 62],
      [84, 65],
      [86, 60],
      [88, 65],
      [90.5, 62],
      [91, 70],
      [86, 73],
    ],
    '#ff8fbf',
    1.6,
  );
};

export const acorn: AccessoryFn = (sink) => {
  F(sink, ellipsePolygon(50, 68, 4.5, 5, 10), '#c98a52', 1.6);
  F(sink, blobPolygon(50, 63.5, 5.5, 2.8, 0.7, 10), '#8f5a3a', 1.6);
  sink.line(
    [
      [50, 61],
      [51, 58],
    ],
    { w: 1.6 },
  );
};

export const bamboo: AccessoryFn = (sink, a) => {
  const x = a.hx + 1;
  const y = a.hy;
  sink.stroke(
    [
      [x, y + 14],
      [x + 2, y - 18],
    ],
    '#7cc46a',
    4.5,
  );
  sink.line(
    [
      [x, y + 14],
      [x + 2, y - 18],
    ],
    { w: 2 },
  );
  for (const v of [4, -7]) {
    sink.line(
      [
        [x - 0.4 + (4 - v) * 0.06, y + v],
        [x + 3 + (4 - v) * 0.06, y + v],
      ],
      { w: 1.4 },
    );
  }
  F(sink, ellipsePolygon(x + 7, y - 15, 5, 2, 8, -0.5), '#7cc46a', 1.4);
};

export const berries: AccessoryFn = (sink, a) => {
  const x = a.hx;
  const y = a.hy;
  sink.fill(ellipsePolygon(x + 1, y - 5, 4, 2, 8, -0.6), '#54b86a');
  for (const [u, v] of [
    [x - 2, y],
    [x + 2, y + 1],
    [x, y + 3.5],
  ] as const) {
    F(sink, ellipsePolygon(u, v, 2.4, 2.4, 8), '#e8453c', 1.3);
  }
};

export const pizza: AccessoryFn = (sink, a) => {
  const x = a.hx;
  const y = a.hy;
  F(
    sink,
    [
      [x - 5, y - 6],
      [x + 6, y - 5],
      [x + 1, y + 8],
    ],
    '#ffd84a',
    1.8,
  );
  sink.stroke(
    [
      [x - 5, y - 6],
      [x + 6, y - 5],
    ],
    '#e0a060',
    3,
  );
  for (const [u, v] of [
    [x - 1, y - 2],
    [x + 2.5, y + 1],
  ] as const) {
    sink.dot(u, v, 1.5, '#e8453c');
  }
};

export const dice: AccessoryFn = (sink) => {
  const x = 81;
  const y = 86;
  F(
    sink,
    [
      [x - 5, y - 5],
      [x + 5, y - 5],
      [x + 5, y + 5],
      [x - 5, y + 5],
    ],
    '#ff5a4d',
    1.8,
  );
  for (const [u, v] of [
    [x - 2.2, y - 2.2],
    [x, y],
    [x + 2.2, y + 2.2],
  ] as const) {
    sink.dot(u, v, 1, CREAM_WHITE);
  }
};

export const balloon: AccessoryFn = (sink) => {
  const x = 82;
  const y = 16;
  F(
    sink,
    [
      [x - 9, y],
      [x - 7.5, y - 8.5],
      [x, y - 12],
      [x + 7.5, y - 8.5],
      [x + 9, y],
      [x + 4, y + 8],
      [x - 4, y + 8],
    ],
    '#ff5a4d',
    2,
  );
  sink.stroke(
    [
      [x, y - 11.5],
      [x, y + 7.5],
    ],
    '#ffd84a',
    4,
  );
  sink.line(
    [
      [x - 4, y + 8],
      [x - 2.5, y + 13],
    ],
    { w: 1.2 },
  );
  sink.line(
    [
      [x + 4, y + 8],
      [x + 2.5, y + 13],
    ],
    { w: 1.2 },
  );
  F(
    sink,
    [
      [x - 3, y + 13],
      [x + 3, y + 13],
      [x + 2.5, y + 17],
      [x - 2.5, y + 17],
    ],
    '#c98a52',
    1.4,
  );
};
