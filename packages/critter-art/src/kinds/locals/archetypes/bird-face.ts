import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import type { OpSink } from '../../../core/ops';
import { F, W } from '../../../core/ops';
import { blobPolygon, ellipsePolygon } from '../../../core/shapes';
import { eyes, extras, iris, isShut, toes } from '../../parts/face';
import type { KindDrawOptions } from '../../registry';
import { drawAccessory } from '../parts/accessories';
import { BEAK } from '../parts/beaks';
import { CREAM_WHITE, CRITTER_INK, drawCheekDots, mirrorX } from '../helpers';
import type { ArchetypeColors } from '../types';
import type { CritterSpec } from '../../../data/types';

/** Everything `bird.ts` computes while drawing the body/head decoration, needed to finish the figure (wings, outline, feet, eyes, beak, accessory). */
export interface BirdContext {
  readonly v: string;
  readonly pose: string;
  readonly isRaptor: boolean;
  readonly wingColor: string;
  readonly body: readonly Point[];
  readonly ex: number;
  readonly ey: number;
  readonly er: number;
  readonly by: number;
}

/** design/critters-draw-2.js `A.bird`, continued: wings, the body/wing/ear-tuft outlines, feet, eyes, beak and the accessory/extras tail end. */
export function drawBirdFace(
  sink: OpSink,
  options: KindDrawOptions,
  spec: CritterSpec,
  colors: ArchetypeColors,
  ctx: BirdContext,
): void {
  const { v, pose, isRaptor, body, ex, ey, er, by } = ctx;
  const wingColor = v === 'gull' ? colors.dk : ctx.wingColor;

  let wingLeft: Point[] = [
    [28, 47],
    [19, 61],
    [25, 75],
  ];
  let wingRight: Point[] = mirrorX(wingLeft);
  if (pose === 'wave') {
    wingRight = [
      [72, 46],
      [84, 37],
      [88, 26],
    ];
  }
  if (pose === 'cheer') {
    wingRight = [
      [72, 46],
      [84, 37],
      [88, 26],
    ];
    wingLeft = mirrorX(wingRight);
  }
  const hasWings = !['kiwi', 'humming', 'peacock'].includes(v);
  if (hasWings) {
    sink.stroke(wingLeft, wingColor, 7);
    sink.stroke(wingRight, wingColor, 7);
    if (v === 'goldfinch') {
      sink.stroke(wingLeft.slice(0, 2), '#ffd84a', 3.4);
      sink.stroke(wingRight.slice(0, 2), '#ffd84a', 3.4);
    }
    if (v === 'hoopoe') {
      for (const wing of [wingLeft, wingRight]) {
        const start = pointAt(wing, 0);
        const end = pointAt(wing, 2);
        for (const t of [0.3, 0.6]) {
          const x = start[0] + (end[0] - start[0]) * t;
          const y = start[1] + (end[1] - start[1]) * t;
          sink.stroke(
            [
              [x - 3, y],
              [x + 3, y],
            ],
            CREAM_WHITE,
            2,
          );
        }
      }
    }
  }
  sink.line(body, { w: 2.6, close: true });
  if (hasWings) {
    sink.line(wingLeft, { w: 2.3 });
    sink.line(wingRight, { w: 2.3 });
  }
  if (v === 'owl') {
    const tuft: Point[] = [
      [31, 27],
      [27, 13],
      [40, 22],
    ];
    sink.line(tuft, { w: 2 });
    sink.line(mirrorX(tuft), { w: 2 });
  }

  const footColor = isRaptor ? '#ffd84a' : v === 'penguin' ? '#ffb8c8' : spec.lc || '#ff9a4d';
  if (v === 'kiwi') {
    for (const [x, y] of [
      [42, 86],
      [60, 86],
    ] as const) {
      const leg: Point[] = [
        [x, y],
        [x - 1, y + 9],
      ];
      sink.line(leg, { w: 3, color: '#c9a06a', taper: false });
      toes(sink, leg, CRITTER_INK);
    }
  } else if (v !== 'humming' && v !== 'owl') {
    for (const p of [
      [[35, 93], [41, 85], [47, 93]],
      [[53, 93], [59, 85], [65, 93]],
    ] as const) {
      F(sink, p, footColor, 2);
    }
  } else {
    for (const [x, y] of [
      [43, 88],
      [57, 88],
    ] as const) {
      sink.line(
        [
          [x - 2.5, y],
          [x, y + 3],
          [x + 2.5, y],
        ],
        { w: 2, color: '#c99a2a' },
      );
    }
  }

  if (v === 'owl') {
    iris(
      sink,
      options,
      [
        [40, 41],
        [60, 41],
      ],
      7,
      '#ffd84a',
    );
  } else {
    eyes(
      sink,
      options,
      [
        [50 - ex, ey],
        [50 + ex, ey],
      ],
      er,
    );
  }
  if (isRaptor && !isShut(options)) {
    sink.line(
      [
        [36, 30.5],
        [45, 32.5],
      ],
      { w: 2.2 },
    );
    sink.line(
      [
        [64, 30.5],
        [55, 32.5],
      ],
      { w: 2.2 },
    );
  }

  if (v === 'hornbill') {
    F(
      sink,
      [
        [43, 40],
        [44, 33.5],
        [50, 31],
        [56, 33.5],
        [57, 40],
      ],
      '#ffe89a',
      1.8,
    );
    F(
      sink,
      [
        [43, 40],
        [57, 40],
        [58, 47],
        [52, 60],
        [50, 62],
        [48, 60],
        [42, 47],
      ],
      '#ffd84a',
      2,
    );
  } else if (v === 'rooster') {
    W(
      sink,
      [
        [42, 19],
        [44, 8],
        [48, 14],
        [51, 5],
        [54, 13],
        [58, 8],
        [59, 19],
      ],
      '#ff4a3d',
      1.8,
    );
    F(sink, BEAK['short'] ?? [], '#ffd84a', 2);
    F(
      sink,
      [
        [47, 50],
        [53, 50],
        [52.5, 57],
        [50, 59],
        [47.5, 57],
      ],
      '#ff4a3d',
      1.6,
    );
  } else {
    const beakShape =
      BEAK[spec.beak ?? (isRaptor ? 'hook' : v === 'owl' ? 'owl' : v === 'duck' ? 'duck' : 'short')] ?? BEAK['short'] ?? [];
    F(
      sink,
      beakShape.map(([x, y]): Point => [x, y + by]),
      spec.bc || (v === 'gull' ? '#ffd84a' : isRaptor ? '#ffd84a' : '#ff9a4d'),
      2,
    );
    if (v === 'gull') sink.dot(52.5, 48.5, 1.5, '#ff4a3d');
    if (v === 'pigeon') sink.fill(ellipsePolygon(50, 42.5, 3, 1.8, 8), CREAM_WHITE);
  }
  if (v === 'peacock') {
    for (const [ax, ay, cx, cy] of [
      [50, 15, 50, 5],
      [45, 16, 41, 7],
      [55, 16, 59, 7],
    ] as const) {
      sink.line(
        [
          [ax, ay],
          [cx, cy],
        ],
        { w: 1.6 },
      );
      sink.dot(cx, cy, 2, colors.f);
    }
  }
  if (v === 'humming') sink.fill(blobPolygon(50, 52, 9, 5.5, 0.85, 10), '#ff5fa8');
  drawCheekDots(
    sink,
    [
      [50 - ex - 7, ey + 8],
      [50 + ex + 7, ey + 8],
    ],
    2.8,
  );
  drawAccessory(sink, spec, colors, {
    x: 50,
    y: v === 'owl' ? 22 : v === 'kiwi' ? 38 : 16,
    w: 17,
    cy: 30,
    ny: 49,
    nw: 21,
    hx: 78,
    hy: 58,
  });
  extras(sink, options);
}
