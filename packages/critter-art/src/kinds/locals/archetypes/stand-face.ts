import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { blobPolygon, ellipsePolygon, superellipseArc, tubeOutline } from '../../../core/shapes';
import type { TubeOutline } from '../../../core/shapes';
import { eyes, extras } from '../../parts/face';
import type { KindDrawOptions } from '../../registry';
import { drawAccessory } from '../parts/accessories';
import { drawEars } from '../parts/ears';
import { drawStandMask } from './stand-masks';
import { CREAM_WHITE, CRITTER_INK, drawCheekDots, drawNose, drawSmile } from '../helpers';
import type { HeadFrame } from '../helpers';
import type { ArchetypeColors } from '../types';
import type { CritterSpec } from '../../../data/types';

/** Everything `stand.ts` computes while drawing the tail/legs/body/neck/ears/horns, needed to finish the figure (pattern overlays, outlines, face, accessory). */
export interface StandBodyContext {
  readonly v: string;
  readonly isElephant: boolean;
  readonly isDachshund: boolean;
  readonly isCamel: boolean;
  readonly isHorse: boolean;
  readonly isMoose: boolean;
  readonly isGiraffe: boolean;
  readonly bx: number;
  readonly by: number;
  readonly brx: number;
  readonly bry: number;
  readonly bodyExponent: number;
  readonly hx: number;
  readonly hy: number;
  readonly hrx: number;
  readonly hry: number;
  readonly headFrame: HeadFrame;
  readonly head: readonly Point[];
  readonly neckCurve: readonly Point[];
  readonly neck: TubeOutline;
  readonly maneTube: TubeOutline | null;
  readonly bodyRimY: (x: number, sign: number) => number;
}

/** design/critters-draw-1.js `X.A.stand`, continued: coat pattern overlays, the body/neck/head outlines, face masks, muzzle/eyes/mouth and the accessory/extras tail end. */
export function drawStandFace(
  sink: OpSink,
  options: KindDrawOptions,
  spec: CritterSpec,
  colors: ArchetypeColors,
  ctx: StandBodyContext,
): void {
  const { v, isElephant, isDachshund, isCamel, isHorse, isMoose, isGiraffe } = ctx;
  const {
    bx,
    by,
    brx,
    bry,
    bodyExponent,
    hx,
    hy,
    hrx,
    hry,
    headFrame,
    head,
    neck,
    maneTube,
    bodyRimY,
  } = ctx;

  const pattern = spec.pat;
  if (pattern === 'spots') {
    for (const [x, y] of [
      [50, 57],
      [58, 54],
      [66, 57],
      [62, 64],
      [52, 65],
      [72, 62],
      [45, 62],
    ] as const) {
      sink.dot(x, y, 1.9, CREAM_WHITE);
    }
  }
  if (pattern === 'cow') {
    for (const [x, y, a, b] of [
      [52, 59, 6, 4.5],
      [69, 66, 5, 4],
      [hx - 7, hy - 7, 4, 3.5],
    ] as const) {
      sink.fill(blobPolygon(x, y, a, b, 0.8, 10), colors.dk);
    }
  }
  if (pattern === 'giraffe') {
    const spots: Point[] = [
      [48, 58],
      [57, 55],
      [66, 58],
      [74, 62],
      [55, 64],
      [64, 66],
      [44, 65],
      pointAt(ctx.neckCurve, 1),
      pointAt(ctx.neckCurve, 3),
      pointAt(ctx.neckCurve, 5),
    ];
    for (const [x, y] of spots) sink.fill(blobPolygon(x, y, 3.2, 2.7, 0.7, 8), colors.dk);
  }
  if (pattern === 'zebra') {
    for (let i = 0; i < 7; i++) {
      const x = 42 + i * 5.5;
      sink.stroke(
        [
          [x - 1, bodyRimY(x, -1) + 1.5],
          [x + 1, bodyRimY(x, 1) - 2],
        ],
        colors.dk,
        2.6,
      );
    }
    for (const i of [1, 3, 5]) {
      sink.stroke([pointAt(neck.left, i), pointAt(neck.right, i)], colors.dk, 2.4);
    }
    for (const [x, y] of [
      [hx - 6, hy - 9],
      [hx + 6, hy - 9],
    ] as const) {
      sink.stroke(
        [
          [x, y],
          [x + (x - hx) * 0.3, y + 5],
        ],
        colors.dk,
        2,
      );
    }
  }
  if (pattern === 'waldi') {
    const waldiColors = ['#ffd84a', '#54d6a4', '#ff9a4d', '#ffd84a', '#54d6a4', '#ff9a4d'];
    waldiColors.forEach((color, i) => {
      const x = 44 + i * 7.5;
      sink.stroke(
        [
          [x, bodyRimY(x, -1) + 1.5],
          [x, bodyRimY(x, 1) - 1.5],
        ],
        color,
        5.5,
      );
    });
  }

  sink.line(superellipseArc(bx, by, brx, bry, bodyExponent, 4.3, 9.65, 22), { w: 2.4 });
  if (isCamel)
    sink.line(superellipseArc(bx + 3, by - bry + 1, 11, 9, 0.8, 3.35, 6.07, 10), { w: 2.3 });
  sink.line(neck.left.slice(1, -1), { w: 2.3 });
  sink.line(neck.right.slice(1, -1), { w: 2.3 });
  if (maneTube) sink.line(maneTube.right, { w: 2 });
  drawEars(sink, spec.ears || (isElephant ? '' : 'horse'), headFrame, colors, spec, 1);
  if (isElephant) {
    for (const m of [-1, 1]) {
      const c: Point = [hx + m * 16, hy + 2];
      sink.line(
        m < 0
          ? superellipseArc(c[0], c[1], 11, 14, 1, 1.2, 5.1, 14)
          : superellipseArc(c[0], c[1], 11, 14, 1, -1.95, 1.95, 14),
        { w: 2.3 },
      );
      sink.fill(ellipsePolygon(c[0] + m * 2, c[1] + 1, 6, 8.5, 10), '#ffc2d0');
    }
  }
  sink.line(head, { w: 2.5, close: true });

  if (isHorse) {
    W(
      sink,
      [
        [hx - 5, hy - hry + 3],
        [hx - 1, hy - hry - 4],
        [hx + 4, hy - hry - 2],
        [hx + 5, hy - hry + 3.5],
        [hx, hy - hry + 5.5],
      ],
      spec.mc || colors.dk,
      1.8,
    );
  }
  drawStandMask(sink, spec, colors, hx, hy, hrx, hry);
  if (pattern === 'painted') {
    F(
      sink,
      [
        [hx, hy - 12.5],
        [hx - 5, hy - 6.5],
        [hx, hy - 0.5],
        [hx + 5, hy - 6.5],
      ],
      '#ff8fbf',
      1.6,
    );
    for (const [x, y] of [
      [hx - 9, hy - 8],
      [hx + 9, hy - 8],
      [hx - 11, hy + 3],
      [hx + 11, hy + 3],
    ] as const) {
      sink.dot(x, y, 1.5, '#ffb84d');
    }
  }

  const eyeY = hy - 2.5;
  const eyeGap = isElephant ? 8.5 : 7.8;
  if (isElephant) {
    const trunkCurve: Point[] = [
      [hx, hy + 5],
      [hx - 0.5, hy + 13],
      [hx - 2, hy + 20],
      [hx - 6.5, hy + 25],
      [hx - 10.5, hy + 23],
    ];
    const trunk = tubeOutline(trunkCurve, 10, 5);
    sink.wash(trunk.polygon, colors.f);
    if (pattern === 'painted') {
      for (const i of [1, 2, 3]) {
        sink.stroke(
          [pointAt(trunk.left, i), pointAt(trunk.right, i)],
          i === 2 ? '#ffb84d' : '#ff8fbf',
          2.2,
        );
      }
    }
    sink.line(trunk.left.slice(1), { w: 2.2 });
    sink.line(trunk.right.slice(1), { w: 2.2 });
    sink.line([pointAt(trunk.left, 4), pointAt(trunk.right, 4)], { w: 2 });
    sink.line(
      [
        [hx + 5, hy + 9],
        [hx + 8, hy + 11],
        [hx + 11, hy + 9],
      ],
      { w: 1.8 },
    );
  } else if (isDachshund) {
    sink.fill(blobPolygon(hx, hy + 7, 9, 7.5, 0.8, 12), colors.bl);
    drawNose(sink, hx, hy + 5, 4, 2.8);
    sink.line(
      [
        [hx - 4, hy + 10],
        [hx, hy + 12],
        [hx + 4, hy + 10],
      ],
      { w: 1.8 },
    );
  } else if (isHorse || isCamel || isMoose || v === 'cow' || v === 'buffalo' || isGiraffe) {
    const muzzle = blobPolygon(
      hx,
      hy + hry * 0.5,
      hrx * (isMoose ? 0.78 : 0.66),
      hry * (isMoose ? 0.5 : 0.42),
      0.8,
      12,
    );
    F(sink, muzzle, v === 'cow' ? '#ffc2cf' : spec.mzc || colors.bl, 1.8);
    sink.dot(hx - 3.6, hy + hry * 0.45, 1.2, CRITTER_INK);
    sink.dot(hx + 3.6, hy + hry * 0.45, 1.2, CRITTER_INK);
    drawSmile(sink, hx, hy + hry * 0.72, 3, 1.4);
    if (isMoose) {
      W(
        sink,
        [
          [hx - 3, hy + hry - 0.5],
          [hx - 1, hy + hry + 7],
          [hx + 2, hy + hry + 7.5],
          [hx + 3, hy + hry - 0.5],
        ],
        colors.f,
        1.8,
      );
    }
  } else {
    sink.fill(
      [
        [hx - 2.6, hy + 5],
        [hx + 2.6, hy + 5],
        [hx, hy + 7.4],
      ],
      CRITTER_INK,
    );
    drawSmile(sink, hx, hy + 8.6, 3.2, 1.6);
  }
  eyes(
    sink,
    options,
    [
      [hx - eyeGap, eyeY],
      [hx + eyeGap, eyeY],
    ],
    4.2,
  );
  drawCheekDots(
    sink,
    [
      [hx - 11.5, hy + 4.5],
      [hx + 11.5, hy + 4.5],
    ],
    2.4,
  );
  if (spec.beard) {
    W(
      sink,
      [
        [hx - 3, hy + hry - 1.5],
        [hx, hy + hry + 7],
        [hx + 3, hy + hry - 1.5],
      ],
      colors.bl,
      1.8,
    );
  }
  drawAccessory(sink, spec, colors, {
    x: hx,
    y: hy - hry,
    w: hrx,
    cy: hy,
    ny: hy + hry,
    nw: 7.5,
    hx: 20,
    hy: 70,
  });
  extras(sink, options);
}
