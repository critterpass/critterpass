import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import { F } from '../../../core/ops';
import { superellipseArc } from '../../../core/shapes';
import { extras } from '../../parts/face';
import { drawCheekDots } from '../helpers';
import type { ArchetypeFn } from '../types';
import { drawLizardPatternDetails, drawLizardPreWashDecorations } from './lizard-decorations';
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
    [52, 76],
    [56, 87],
    [66, 93.5],
    [79, 91],
    [87, 81],
    [84, 70],
    [76, 67.5],
    [71, 73],
    [75, 79],
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
      [26, 27],
      [32, 16],
      [50, 12.5],
      [68, 16],
      [74, 27],
      [73, 38],
      [64, 45],
      [50, 47],
      [36, 45],
      [27, 38],
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

  drawLizardPreWashDecorations(sink, colors, isSmok, isDragon, isCroc);
  sink.wash(body, colors.f);
  sink.wash(head, colors.f);
  sink.stroke(tail, colors.f, tailWidth);
  drawLizardPatternDetails(sink, spec, colors, isDragon, isSmok, isCroc, isKomodo);
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
