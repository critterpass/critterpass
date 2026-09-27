import type { Point } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { ellipsePolygon, fluffPolygon } from '../../../core/shapes';
import { eyes, isShut, toes } from '../../parts/face';
import type { KindDrawOptions } from '../../registry';
import { CREAM_WHITE, CRITTER_INK, mirrorX } from '../helpers';
import type { ArchetypeColors } from '../types';

/** Everything `lizard.ts` computes while assembling the body/head/tail, needed to finish the figure (limbs, eyes, face detail). */
export interface LizardContext {
  readonly v: string;
  readonly isCroc: boolean;
  readonly isDragon: boolean;
  readonly isSmok: boolean;
  readonly isKomodo: boolean;
  readonly isSlim: boolean;
  readonly isBig: boolean;
}

/** design/critters-draw-2.js `A.lizard`, continued: limbs, eyes (three distinct styles) and variant-specific face detail. */
export function drawLizardFace(
  sink: OpSink,
  options: KindDrawOptions,
  spec: { readonly pose?: string },
  colors: ArchetypeColors,
  ctx: LizardContext,
): void {
  const { isCroc, isDragon, isSmok, isKomodo, isSlim, isBig } = ctx;
  const pose = options.pose ?? spec.pose ?? 'idle';

  let armLeft: Point[] = isBig
    ? [
        [41, 50],
        [32, 53],
        [27, 49],
      ]
    : [
        [43, 49],
        [33, 50],
        [25, 43],
      ];
  let armRight: Point[] = mirrorX(armLeft);
  if (pose === 'wave' || isDragon) {
    armRight = [
      [57, 49],
      [69, 43],
      [74, 32],
    ];
  }
  if (pose === 'cheer') {
    armRight = [
      [57, 48],
      [68, 40],
      [72, 28],
    ];
    armLeft = mirrorX(armRight);
  }
  const legLeft: Point[] = isBig
    ? [
        [41, 71],
        [32, 76],
        [29, 84],
      ]
    : [
        [43, 70],
        [33, 74],
        [27, 84],
      ];
  const legRight: Point[] = mirrorX(legLeft);
  for (const limb of [armLeft, armRight, legLeft, legRight]) {
    sink.line(limb, { w: 2.5, taper: false });
    toes(sink, limb, CRITTER_INK);
  }

  if (isCroc) {
    eyes(
      sink,
      options,
      [
        [38, 17],
        [62, 17],
      ],
      5.6,
    );
  } else if (isDragon || isSmok || isKomodo) {
    eyes(
      sink,
      options,
      [
        [35.5, 25],
        [64.5, 25],
      ],
      isKomodo ? 5.4 : 6.4,
    );
  } else {
    for (const [x, y] of [
      [31, 24],
      [69, 24],
    ] as const) {
      if (isShut(options)) {
        sink.line(
          [
            [x - 5, y + 1],
            [x, y + 3.6],
            [x + 5, y + 1],
          ],
          { w: 2.4 },
        );
        continue;
      }
      const r = isSlim ? 6.6 : 7.4;
      sink.fill(ellipsePolygon(x, y, r, r, 14), options.eye);
      sink.line(ellipsePolygon(x, y, r, r, 14), { w: 2.3, close: true });
      sink.fill(ellipsePolygon(x, y + 0.5, 1.9, r * 0.62, 10), options.pupil);
      sink.dot(x - 1.6, y - 2, 1.2, options.eye);
    }
  }

  if (isCroc) {
    sink.dot(45, 33, 1.3, CRITTER_INK);
    sink.dot(55, 33, 1.3, CRITTER_INK);
    sink.line(
      [
        [30, 38],
        [40, 42.5],
        [50, 43.5],
        [60, 42.5],
        [70, 38],
      ],
      { w: 2.2 },
    );
    for (const [x, y] of [
      [36, 40.3],
      [44, 42.6],
      [56, 42.6],
      [64, 40.3],
    ] as const) {
      sink.fill(
        [
          [x - 1.6, y],
          [x + 1.6, y],
          [x, y + 2.8],
        ],
        CREAM_WHITE,
      );
    }
  } else {
    sink.dot(46.5, 20.5, 0.9, CRITTER_INK);
    sink.dot(53.5, 20.5, 0.9, CRITTER_INK);
    sink.line(
      [
        [40, 33],
        [50, 37],
        [60, 33],
      ],
      { w: 2.1 },
    );
  }
  if (isKomodo) {
    F(
      sink,
      [
        [48.5, 38.5],
        [51.5, 38.5],
        [51.5, 45],
        [54, 49],
        [50, 46.5],
        [46, 49],
        [48.5, 45],
      ],
      '#ff5a6e',
      1.3,
    );
  }
  if (isDragon) {
    const brow: Point[] = [
      [36, 35],
      [24, 37],
      [14, 33],
      [8, 37],
    ];
    sink.line(brow, { w: 1.7 });
    sink.line(mirrorX(brow), { w: 1.7 });
    F(sink, ellipsePolygon(77, 27, 5.5, 5.5, 12), '#e6f2ff', 1.9);
    sink.dot(75.5, 25.2, 1.4, CREAM_WHITE);
  }
  if (isSmok) {
    const brow: Point[] = [
      [38, 18],
      [34, 8],
      [42, 15],
    ];
    for (const i of [0, 1]) W(sink, i ? mirrorX(brow) : brow, '#fff1d6', 1.7);
    W(sink, fluffPolygon(80, 14, 5, 4, 5, 0.3), '#ece8f4', 1.6);
    W(sink, fluffPolygon(88, 7, 3, 2.6, 4, 0.3), '#ece8f4', 1.4);
  }
}
