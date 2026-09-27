import type { Point } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { ellipsePolygon, fluffPolygon } from '../../../core/shapes';
import { CREAM_WHITE, mirrorX } from '../helpers';
import type { ArchetypeColors } from '../types';
import type { CritterSpec } from '../../../data/types';

/**
 * design/critters-draw-2.js `A.lizard`, drawn before the body/head wash: smok's wing membranes,
 * dragon's back spines and tail-tip fluff, croc's brow-ridge undercoat.
 */
export function drawLizardPreWashDecorations(
  sink: OpSink,
  colors: ArchetypeColors,
  isSmok: boolean,
  isDragon: boolean,
  isCroc: boolean,
): void {
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
      [
        [40, 17],
        [35, 7],
        [30, 3],
      ],
      [
        [37, 10],
        [42, 4],
      ],
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
}

/**
 * design/critters-draw-2.js `A.lizard`, drawn after the body/head wash and tail stroke but before
 * the outline pass: dragon/smok's horn-crown spikes, the coat pattern overlay (mosaic/dots/plain
 * bands), croc's jaw-line detail and smok's belly stripes.
 */
export function drawLizardPatternDetails(
  sink: OpSink,
  spec: Pick<CritterSpec, 'pat'>,
  colors: ArchetypeColors,
  isDragon: boolean,
  isSmok: boolean,
  isCroc: boolean,
  isKomodo: boolean,
): void {
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
      [40, 24, '#ffd84a'],
      [50, 20, '#ff9a4d'],
      [60, 24, '#54d6a4'],
      [45, 33, '#ff8fbf'],
      [56, 33, '#ffd84a'],
      [46, 50, '#54d6a4'],
      [54, 50, '#ffd84a'],
      [50, 58, '#ff9a4d'],
      [45, 66, '#ff8fbf'],
      [55, 66, '#54d6a4'],
      [50, 73, '#ffd84a'],
      [62, 90, '#ff9a4d'],
      [76, 91, '#54d6a4'],
      [85, 80, '#ff8fbf'],
    ] as const;
    tiles.forEach(([x, y, color], i) => F(sink, ellipsePolygon(x, y, 3.2, 2.5, 6, i), color, 1.2));
  } else if (spec.pat === 'dots') {
    for (const [x, y] of [
      [44, 52],
      [56, 56],
      [46, 64],
      [54, 70],
      [62, 88],
      [76, 90],
      [42, 24],
      [58, 24],
    ] as const) {
      sink.dot(x, y, 1.5, CREAM_WHITE);
    }
  } else if (!isCroc && !isKomodo) {
    for (const b of [
      [
        [44, 55],
        [50, 57],
        [56, 55],
      ],
      [
        [43, 63],
        [50, 65.5],
        [57, 63],
      ],
      [
        [45, 71],
        [50, 73],
        [55, 71],
      ],
    ] as const) {
      sink.stroke(b, colors.dk, 2.6);
    }
  }
  if (isCroc) {
    for (const l of [
      [
        [43, 52],
        [57, 52],
      ],
      [
        [42, 60],
        [58, 60],
      ],
      [
        [43, 68],
        [57, 68],
      ],
      [
        [70, 90],
        [72, 85],
      ],
      [
        [82, 87],
        [80, 82],
      ],
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
}
