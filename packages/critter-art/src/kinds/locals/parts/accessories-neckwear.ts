import { CRITTER_INK } from '../helpers';
import { F } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { blobPolygon, ellipsePolygon } from '../../../core/shapes';
import type { AccessoryAnchor } from '../types';
import type { AccessoryFn } from './accessories-types';

/** design/critters-draw-1.js `band`: the shared neck-band shape behind scarf/tartan/redscarf, optionally with a check pattern. */
function band(sink: OpSink, a: AccessoryAnchor, color: string, check?: true): void {
  const { x, ny, nw } = a;
  const p = [
    [x - nw, ny - 2],
    [x, ny + 3],
    [x + nw, ny - 2],
    [x + nw * 1.02, ny + 3],
    [x, ny + 8.5],
    [x - nw * 1.02, ny + 3],
  ] as const;
  F(sink, p, color, 2);
  if (check) {
    sink.line(
      [
        [x - nw, ny + 0.6],
        [x, ny + 5.6],
        [x + nw, ny + 0.6],
      ],
      { w: 1.1, color: '#2c2750' },
    );
    for (const u of [-0.5, 0.5]) {
      sink.line(
        [
          [x + nw * u, ny + 0.8],
          [x + nw * u * 0.92, ny + 6],
        ],
        { w: 1.2, color: '#ffd84a' },
      );
    }
  }
  F(
    sink,
    [
      [x + nw * 0.35, ny + 5],
      [x + nw * 0.62, ny + 16],
      [x + nw * 0.2, ny + 15],
    ],
    color,
    1.8,
  );
}

export const scarf: AccessoryFn = (sink, a, spec) => band(sink, a, spec.sc || '#ff5a4d');
export const tartan: AccessoryFn = (sink, a) => band(sink, a, '#e8453c', true);
export const redscarf: AccessoryFn = (sink, a) => band(sink, a, '#e8453c');

export const collar: AccessoryFn = (sink, a) => {
  const { x, ny, nw } = a;
  F(
    sink,
    [
      [x - nw, ny - 2],
      [x, ny + 4],
      [x + nw, ny - 2],
      [x + nw * 0.9, ny + 4],
      [x, ny + 10],
      [x - nw * 0.9, ny + 4],
    ],
    '#ffd84a',
    2,
  );
  sink.line(
    [
      [x - nw * 0.9, ny + 1.5],
      [x, ny + 7],
      [x + nw * 0.9, ny + 1.5],
    ],
    { w: 1.6, color: '#3d6fe0' },
  );
};

export const knot: AccessoryFn = (sink, a) => {
  const { x, ny } = a;
  F(
    sink,
    [
      [x, ny],
      [x - 4, ny + 4],
      [x, ny + 8],
      [x + 4, ny + 4],
    ],
    '#e8453c',
    1.6,
  );
  for (const u of [-1, 1]) {
    sink.line(
      [
        [x, ny + 8],
        [x + u, ny + 14],
      ],
      { w: 1.6, color: '#e8453c' },
    );
  }
};

export const bell: AccessoryFn = (sink, a) => {
  const { x, ny } = a;
  sink.line(
    [
      [x - 6, ny - 1],
      [x, ny + 2],
      [x + 6, ny - 1],
    ],
    { w: 2.4, color: '#e8453c' },
  );
  F(
    sink,
    [
      [x - 4.5, ny + 10],
      [x - 3.5, ny + 3.5],
      [x, ny + 2],
      [x + 3.5, ny + 3.5],
      [x + 4.5, ny + 10],
    ],
    '#ffd84a',
    1.8,
  );
  sink.dot(x, ny + 11, 1.5, CRITTER_INK);
};

export const barrel: AccessoryFn = (sink, a) => {
  const { x, ny } = a;
  F(sink, blobPolygon(x, ny + 6, 6.5, 4.5, 0.7, 12), '#c98a52', 1.8);
  for (const u of [-2.5, 2.5]) {
    sink.line(
      [
        [x + u, ny + 1.8],
        [x + u, ny + 10.2],
      ],
      { w: 1.2 },
    );
  }
};

export const amber: AccessoryFn = (sink, a) => {
  const { x, ny, nw } = a;
  sink.line(
    [
      [x - nw * 0.7, ny + 1],
      [x, ny + 6],
      [x + nw * 0.7, ny + 1],
    ],
    { w: 1.4 },
  );
  F(sink, ellipsePolygon(x, ny + 9, 3.3, 4, 10), '#ffb84d', 1.6);
};

export const tassel: AccessoryFn = (sink, a) => {
  const { x, ny, nw } = a;
  sink.line(
    [
      [x - nw, ny],
      [x, ny + 4],
      [x + nw, ny],
    ],
    { w: 2, color: '#e8453c' },
  );
  for (const [u, color] of [
    [-0.6, '#ffd84a'],
    [0, '#4f86ff'],
    [0.6, '#54d6a4'],
  ] as const) {
    const px = x + u * nw;
    const py = ny + 3.5 - Math.abs(u) * 2;
    F(
      sink,
      [
        [px - 1.6, py],
        [px + 1.6, py],
        [px + 2.4, py + 7],
        [px - 2.4, py + 7],
      ],
      color,
      1.3,
    );
  }
};

export const bridle: AccessoryFn = (sink, a) => {
  const { x, cy } = a;
  sink.line(
    [
      [x - 11, cy + 2],
      [x - 7, cy + 7],
      [x + 7, cy + 7],
      [x + 11, cy + 2],
    ],
    { w: 2, color: '#e8453c' },
  );
  sink.dot(x - 10, cy + 3, 1.6, '#ffd84a');
  sink.dot(x + 10, cy + 3, 1.6, '#ffd84a');
};
