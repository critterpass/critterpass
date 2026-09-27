import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import { ellipsePolygon, fluffPolygon, superellipseArc } from '../../../core/shapes';
import { extras } from '../../parts/face';
import { CREAM_WHITE, drawCheekDots, mirrorX } from '../helpers';
import type { ArchetypeFn } from '../types';
import { drawLizardFace } from './lizard-face';
import type { LizardContext } from './lizard-face';

/**
 * design/critters-draw-2.js `A.lizard`: 7 critters across 5 named variants (dragon/croc/smok/
 * komodo/slim) plus the plain default. Split at the point the design pivots from body assembly to
 * limbs/eyes/face detail — `drawLizardFace` (lizard-face.ts) continues in the same op order.
 */
export const lizard: ArchetypeFn = (sink, options, spec, colors) => {
  const v = spec.v ?? '';
  const isCroc = v === 'croc';
  const isDragon = v === 'dragon';
  const isSmok = v === 'smok';
  const isKomodo = v === 'komodo';
  const isSlim = v === 'slim';
  const isBig = isCroc || isKomodo;

  let body: Point[] = [
    [44, 41],
    [40, 53],
    [40, 67],
    [45, 77],
    [55, 77],
    [60, 67],
    [60, 53],
    [56, 41],
  ];
  let head: Point[] = [
    [29, 29],
    [34, 19],
    [50, 13.5],
    [66, 19],
    [71, 29],
    [65, 38.5],
    [50, 42.5],
    [35, 38.5],
  ];
  let tail: Point[] = [
    [52, 76], [56, 87], [66, 93.5], [79, 91], [87, 81], [84, 70], [76, 67.5], [71, 73], [75, 79],
  ];
  let tailWidth = 9;
  if (isBig) {
    body = [
      [42, 42],
      [37, 55],
      [37, 68],
      [43, 79],
      [57, 79],
      [63, 68],
      [63, 55],
      [58, 42],
    ];
    tail = [
      [54, 77],
      [60, 88],
      [72, 93],
      [85, 88],
      [92, 76],
      [93, 64],
    ];
    tailWidth = 12;
  }
  if (isCroc) {
    head = [
      [26, 27], [32, 16], [50, 12.5], [68, 16], [74, 27], [73, 38], [64, 45], [50, 47], [36, 45], [27, 38],
    ];
  }
  if (isKomodo) {
    head = [
      [28, 29],
      [33, 18],
      [50, 14],
      [67, 18],
      [72, 29],
      [68, 40],
      [50, 45],
      [32, 40],
    ];
  }
  if (isSlim) {
    body = [
      [45, 42],
      [42, 54],
      [42, 67],
      [46, 76],
      [54, 76],
      [58, 67],
      [58, 54],
      [55, 42],
    ];
    tail = [
      [52, 75],
      [55, 86],
      [64, 93],
      [77, 93],
      [87, 86],
      [91, 74],
      [87, 62],
    ];
    tailWidth = 7;
  }
  if (isDragon) {
    tail = [
      [53, 75],
      [58, 86],
      [70, 92],
      [82, 87],
      [87, 75],
      [82, 63],
      [87, 52],
      [94, 49],
    ];
  }
  if (isSmok) {
    const wing: Point[] = [
      [44, 50],
      [27, 35],
      [12, 36],
      [17, 44],
      [9, 50],
      [20, 53],
      [17, 61],
      [41, 58],
    ];
    for (const p of [wing, mirrorX(wing)]) W(sink, p, colors.dk, 2.1);
  }
  if (isDragon) {
    const spines: readonly (readonly Point[])[] = [
      [[40, 17], [35, 7], [30, 3]],
      [[37, 10], [42, 4]],
    ];
    for (const l of spines) {
      for (const p of [l, mirrorX(l)]) {
        sink.stroke(p, '#ffd84a', 3.4);
        sink.line(p, { w: 1.9 });
      }
    }
    W(sink, fluffPolygon(94, 49, 5, 4, 5, 0.4), colors.dk, 1.8);
  }
  if (isCroc) {
    for (const [x, y] of [
      [38, 17],
      [62, 17],
    ] as const) {
      sink.wash(ellipsePolygon(x, y, 8.5, 7.5, 12), colors.f);
    }
  }
  sink.wash(body, colors.f);
  sink.wash(head, colors.f);
  sink.stroke(tail, colors.f, tailWidth);
  if (isDragon || isSmok) {
    for (const [x, y] of [
      [44, 15],
      [50, 12],
      [56, 15],
    ] as const) {
      W(
        sink,
        [
          [x - 2.5, y + 2],
          [x, y - 5],
          [x + 2.5, y + 2],
        ],
        colors.dk,
        1.6,
      );
    }
  }
  if (spec.pat === 'mosaic') {
    const tiles = [
      [40, 24, '#ffd84a'], [50, 20, '#ff9a4d'], [60, 24, '#54d6a4'], [45, 33, '#ff8fbf'], [56, 33, '#ffd84a'],
      [46, 50, '#54d6a4'], [54, 50, '#ffd84a'], [50, 58, '#ff9a4d'], [45, 66, '#ff8fbf'], [55, 66, '#54d6a4'],
      [50, 73, '#ffd84a'], [62, 90, '#ff9a4d'], [76, 91, '#54d6a4'], [85, 80, '#ff8fbf'],
    ] as const;
    tiles.forEach(([x, y, color], i) => F(sink, ellipsePolygon(x, y, 3.2, 2.5, 6, i), color, 1.2));
  } else if (spec.pat === 'dots') {
    for (const [x, y] of [
      [44, 52], [56, 56], [46, 64], [54, 70], [62, 88], [76, 90], [42, 24], [58, 24],
    ] as const) {
      sink.dot(x, y, 1.5, CREAM_WHITE);
    }
  } else if (!isCroc && !isKomodo) {
    for (const b of [
      [[44, 55], [50, 57], [56, 55]],
      [[43, 63], [50, 65.5], [57, 63]],
      [[45, 71], [50, 73], [55, 71]],
    ] as const) {
      sink.stroke(b, colors.dk, 2.6);
    }
  }
  if (isCroc) {
    for (const l of [
      [[43, 52], [57, 52]],
      [[42, 60], [58, 60]],
      [[43, 68], [57, 68]],
      [[70, 90], [72, 85]],
      [[82, 87], [80, 82]],
    ] as const) {
      sink.stroke(l, colors.dk, 2.4);
    }
  }
  if (isSmok) {
    for (const [x, y] of [
      [45, 54],
      [44, 61],
      [45, 68],
    ] as const) {
      sink.line(
        [
          [x, y],
          [100 - x, y],
        ],
        { w: 1.4 },
      );
    }
  }
  sink.line(head, { w: 2.7, close: true });
  const bodySplitY = pointAt(body, 3)[1] + 0.5;
  sink.line([...body.slice(0, 4), [50, bodySplitY]], { w: 2.5 });
  sink.line([[50, bodySplitY], ...body.slice(4)], { w: 2.5 });
  sink.line(tail, { w: 2.5, taper: true });
  if (isCroc) {
    for (const [x, y] of [
      [38, 17],
      [62, 17],
    ] as const) {
      sink.line(superellipseArc(x, y, 8.5, 7.5, 1, 3.3, 6.12, 10), { w: 2.3 });
    }
  }

  const context: LizardContext = { v, isCroc, isDragon, isSmok, isKomodo, isSlim, isBig };
  drawLizardFace(sink, options, spec, colors, context);

  if (spec.acc === 'collar') {
    F(
      sink,
      [
        [37, 41],
        [50, 47],
        [63, 41],
        [64, 46],
        [50, 53],
        [36, 46],
      ],
      '#ffd84a',
      1.9,
    );
    sink.line(
      [
        [37, 44],
        [50, 50],
        [63, 44],
      ],
      { w: 1.4, color: '#3d6fe0' },
    );
  }
  drawCheekDots(
    sink,
    [
      [36, 35],
      [64, 35],
    ],
    3.2,
  );
  extras(sink, options);
};
