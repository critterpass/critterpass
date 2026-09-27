import { F, W } from '../../../core/ops';
import { blobPolygon, catmullRomResample, superellipseArc, tubeOutline } from '../../../core/shapes';
import { dotEyes, eyes, extras } from '../../parts/face';
import { ACC } from '../parts/accessories';
import { drawCheekDots, drawSmile } from '../helpers';
import type { ArchetypeFn } from '../types';

/** design/critters-draw-2.js `A.snake`: 2 critters, `v === 'naga'` (Cambodia) or the plain default (crowned serpent). */
export const snake: ArchetypeFn = (sink, options, spec, colors) => {
  const isNaga = spec.v === 'naga';
  const coilFront = blobPolygon(50, 84, 31, 9.5, 0.85, 16);
  const coilBack = blobPolygon(52, 73, 25, 8.5, 0.85, 16);
  sink.wash(coilFront, colors.f);
  sink.wash(coilBack, colors.f);
  const neck = tubeOutline(catmullRomResample([[62, 71], [68, 60], [63, 50], [55, 44]], 3), 12, 11);
  sink.wash(neck.polygon, colors.f);
  if (isNaga) {
    W(
      sink,
      [
        [28, 46],
        [23, 30],
        [31, 17],
        [50, 11],
        [69, 17],
        [77, 30],
        [72, 46],
        [50, 50],
      ],
      colors.dk,
      2.3,
    );
    for (const [x, y] of [
      [28, 31],
      [72, 31],
    ] as const) {
      W(sink, blobPolygon(x, y, 8, 7, 0.85, 12), colors.f, 2.2);
      dotEyes(
        sink,
        options,
        [
          [x - 2.8, y - 0.5],
          [x + 2.8, y - 0.5],
        ],
        1.6,
      );
    }
  }
  const head = blobPolygon(50, 34, 15, 12, 0.85, 14);
  sink.wash(head, colors.f);
  for (const [x, y] of [
    [26, 84], [38, 88], [52, 89], [66, 88], [76, 83], [34, 73], [46, 77], [58, 77], [70, 72],
  ] as const) {
    sink.stroke(
      [
        [x, y - 3.5],
        [x + 1, y + 3.5],
      ],
      colors.dk,
      3,
    );
  }
  sink.line(superellipseArc(50, 84, 31, 9.5, 0.85, -0.35, 3.49, 16), { w: 2.4 });
  sink.line(coilBack, { w: 2.4, close: true });
  const n = neck.left.length;
  sink.line(neck.left.slice(1, n - 1), { w: 2.3 });
  sink.line(neck.right.slice(1, n - 1), { w: 2.3 });
  sink.line(head, { w: 2.5, close: true });
  eyes(
    sink,
    options,
    [
      [44, 33],
      [56, 33],
    ],
    4.6,
  );
  drawSmile(sink, 50, 38.5, 3.5, 1.8);
  drawCheekDots(
    sink,
    [
      [38, 38],
      [62, 38],
    ],
    2.6,
  );
  F(
    sink,
    [
      [49, 41.5],
      [51, 41.5],
      [51, 46],
      [53.5, 49.5],
      [50, 47.5],
      [46.5, 49.5],
      [49, 46],
    ],
    '#ff5a6e',
    1.3,
  );
  if (spec.acc === 'crown') {
    ACC['crown']?.(sink, { x: 50, y: 23, w: 15, cy: 0, ny: 0, nw: 0, hx: 0, hy: 0 }, spec, colors);
  }
  if (isNaga) sink.dot(50, 26, 2, '#ff5fa8');
  extras(sink, options);
};
