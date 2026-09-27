import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { blobPolygon, ellipsePolygon, fluffPolygon, superellipseArc } from '../../../core/shapes';
import { eyes, extras } from '../../parts/face';
import type { KindDrawOptions } from '../../registry';
import { drawAccessory } from '../parts/accessories';
import { drawEars } from '../parts/ears';
import { drawHorns } from '../parts/horns';
import { drawMask } from '../parts/masks';
import { drawMuzzle } from '../parts/muzzles';
import { drawPattern } from '../parts/patterns';
import { drawTail } from '../parts/tails';
import { drawCheekDots, drawNose, drawSmile, mirrorX } from '../helpers';
import type { ArchetypeColors, ArchetypeFn } from '../types';

/** design/critters-draw-1.js `curls`: coat-curl marks for `s.coat === 'curly' | 'fluffy'`. `bodyHalfWidth` is accepted (matching the design signature exactly) but, like the design, never read. */
function drawCurls(
  sink: OpSink,
  colors: ArchetypeColors,
  headY: number,
  bodyHalfWidth: number,
  kind: 'curly' | 'fluffy',
): void {
  void bodyHalfWidth;
  const spots: Point[] = [
    [37, 59],
    [45, 56],
    [55, 56],
    [63, 59],
    [34, 70],
    [66, 70],
    [38, 80],
    [62, 80],
    [40, headY - 13],
    [50, headY - 16],
    [60, headY - 13],
  ];
  for (const [x, y] of spots) {
    const shape: Point[] =
      kind === 'fluffy'
        ? [
            [x - 2.5, y],
            [x, y - 2],
            [x + 2.5, y],
          ]
        : ellipsePolygon(x, y, 2.1, 2, 8);
    sink.line(shape, { w: 1.4, color: colors.dk, close: kind !== 'fluffy' });
  }
}

/** design/critters-draw-1.js `puli`: the one `sit` variant drawn from scratch instead of the shared body/head/ears pipeline. */
function drawPuli(sink: OpSink, options: KindDrawOptions, colors: ArchetypeColors): void {
  const mop = blobPolygon(50, 57, 28, 34, 0.88, 18);
  sink.wash(mop, colors.f);
  for (let i = 0; i < 10; i++) {
    const x = 29 + i * 4.7;
    const t = Math.abs(x - 50) / 28;
    sink.stroke(
      [
        [x, 28 + t * 14],
        [x + 1.6, 46],
        [x - 1, 64],
        [x + 1.2, 88 - t * 10],
      ],
      colors.dk,
      2.4,
    );
  }
  sink.line(mop, { w: 2.5, close: true });
  sink.line(
    [
      [31, 44],
      [36, 49],
      [41, 45],
      [46, 50],
      [50, 46],
      [54, 50],
      [59, 45],
      [64, 49],
      [69, 44],
    ],
    { w: 1.8 },
  );
  eyes(
    sink,
    options,
    [
      [41, 50],
      [59, 50],
    ],
    4.8,
  );
  drawNose(sink, 50, 57, 3.6, 2.6);
  drawSmile(sink, 50, 61, 4, 2);
  drawCheekDots(
    sink,
    [
      [33, 58],
      [67, 58],
    ],
    3,
  );
  for (const [x, y] of [
    [40, 91.5],
    [60, 91.5],
  ] as const) {
    F(sink, ellipsePolygon(x, y, 6, 3, 10), colors.dk, 1.6);
  }
  extras(sink, options);
}

/** design/critters-draw-1.js `X.A.sit`: the four-legged/seated archetype, 51 critters across 9 named variants plus the plain default. */
export const sit: ArchetypeFn = (sink, options, spec, colors) => {
  const v = spec.v ?? '';
  const hy = spec.hy ?? (v === 'capy' ? 33 : 31);
  const bw = spec.bw ?? 21;
  const headFrame = { x: 50, y: hy, k: 1 };
  const pose = options.pose ?? spec.pose ?? 'idle';

  if (v === 'puli') {
    drawPuli(sink, options, colors);
    return;
  }

  const rx = 25 * (spec.hw ?? 1);
  const ry = 18.5 * (spec.hh ?? 1);
  const top = hy + ry * 0.62;
  const body: Point[] =
    v === 'sheep'
      ? fluffPolygon(50, 71, bw + 3, 18, 9, 0.09)
      : [
          [50 - bw * 0.6, top],
          [50 - bw * 0.97, 63],
          [50 - bw, 77],
          [50 - bw * 0.64, 88],
          [50 + bw * 0.64, 88],
          [50 + bw, 77],
          [50 + bw * 0.97, 63],
          [50 + bw * 0.6, top],
        ];
  const head = blobPolygon(50, hy, rx, ry, v === 'capy' ? 0.62 : 0.8, 16);

  if (v === 'bat') {
    const wing: Point[] = [
      [31, 56],
      [15, 44],
      [4, 52],
      [7, 62],
      [13, 60],
      [15, 70],
      [23, 66],
      [27, 74],
      [33, 68],
    ];
    for (const p of [wing, mirrorX(wing)]) W(sink, p, colors.dk, 2.2);
  }
  drawTail(sink, spec.tail, colors, spec, bw);
  const mane: Point[] | undefined = spec.mane
    ? fluffPolygon(50, hy + 3, rx + 6, ry + 7.5, 10, 0.13)
    : undefined;
  if (mane) sink.wash(mane, spec.mc || colors.dk);
  sink.wash(body, colors.f);
  drawEars(sink, spec.ears, headFrame, colors, spec, 0);
  drawHorns(sink, spec.horns, headFrame, colors, spec);
  sink.wash(head, spec.hc || colors.f);
  if (spec.belly !== 0 && v !== 'sheep')
    sink.fill(ellipsePolygon(50, 73, bw * 0.56, 12, 12), colors.bl);
  drawPattern(sink, spec.pat, colors, hy, bw);
  drawMask(sink, spec.mask, hy, colors, spec);
  sink.line(body, { w: 2.4, close: v === 'sheep' });
  if (mane) sink.line(mane, { w: 2.2, close: true });
  drawEars(sink, spec.ears, headFrame, colors, spec, 1);
  sink.line(head, { w: 2.6, close: true });

  if (v === 'sheep') F(sink, fluffPolygon(50, hy - 14, 16, 7, 6, 0.18), colors.f, 2);
  if (v === 'pangolin') {
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 4 - (r % 2); i++) {
        sink.line(
          superellipseArc(36 + i * 9 + (r % 2) * 4.5, 56 + r * 8, 4.5, 3.6, 1, 0.2, 2.94, 6),
          {
            w: 1.6,
            color: colors.dk,
          },
        );
      }
    }
    for (const [x, y] of [
      [42, hy - 12],
      [50, hy - 14],
      [58, hy - 12],
    ] as const) {
      sink.line(superellipseArc(x, y, 4.2, 3.2, 1, 0.2, 2.94, 6), { w: 1.5, color: colors.dk });
    }
  }
  if (spec.coat === 'curly' || spec.coat === 'fluffy') drawCurls(sink, colors, hy, bw, spec.coat);
  if (spec.hair) {
    for (const [x, y] of [
      [44, hy - 18],
      [50, hy - 19],
      [56, hy - 18],
    ] as const) {
      sink.line(
        [
          [x, y],
          [x + (x - 50) * 0.3, y - 5],
        ],
        { w: 2 },
      );
    }
  }
  drawEars(sink, spec.ears, headFrame, colors, spec, 2);

  const sx = 50 - bw * 0.7;
  const sy = 58 + (hy - 31) * 0.35;
  const longArms = spec.arms === 'long';
  let armLeft: Point[] = longArms
    ? [
        [sx + 1, sy - 1],
        [sx - 9, sy + 10],
        [sx - 9, sy + 22],
      ]
    : [
        [sx, sy],
        [sx - 8, sy + 8],
      ];
  let armRight: Point[] = mirrorX(armLeft);
  const raisedArm: Point[] = [
    [100 - sx, sy - 2],
    [109 - sx, sy - 11],
    [112 - sx, sy - 20],
  ];
  if (pose === 'wave') armRight = raisedArm;
  if (pose === 'cheer') {
    armRight = raisedArm;
    armLeft = mirrorX(raisedArm);
  }
  if (pose === 'think') {
    armRight = [
      [100 - sx, sy],
      [106 - sx, sy - 6],
      [101 - sx, sy - 12],
    ];
  }
  if (v !== 'bat') {
    for (const arm of [armLeft, armRight]) {
      if (spec.arms === 'dark' || longArms) {
        sink.stroke(arm, spec.arms === 'dark' ? colors.dk : colors.f, longArms ? 6 : 7);
      }
      sink.line(arm, { w: 2.4 });
      const end = pointAt(arm, arm.length - 1);
      if (spec.arms === 'claws') {
        for (const k of [-2.5, 0, 2.5]) {
          sink.line(
            [
              [end[0] + k, end[1]],
              [end[0] + k * 1.3, end[1] + 5],
            ],
            { w: 1.6 },
          );
        }
      }
      if (longArms) sink.dot(end[0], end[1], 2.6, colors.dk);
    }
  }

  for (const [x, y] of [
    [40, 89.5],
    [60, 89.5],
  ] as const) {
    F(sink, ellipsePolygon(x, y, 6.5, 3.3, 10), spec.fc || colors.dk, 1.6);
  }
  const eyeGap = spec.eg ?? 12;
  const eyeRadius = spec.er ?? 5.2;
  drawMuzzle(sink, spec.muz, hy, colors, spec);
  eyes(
    sink,
    options,
    [
      [50 - eyeGap, hy],
      [50 + eyeGap, hy],
    ],
    eyeRadius,
  );
  drawCheekDots(
    sink,
    [
      [50 - eyeGap - 9, hy + 9],
      [50 + eyeGap + 9, hy + 9],
    ],
    3,
  );
  drawAccessory(sink, spec, colors, {
    x: 50,
    y: hy - ry,
    w: rx,
    cy: hy,
    ny: hy + ry - 2,
    nw: bw * 0.62,
    hx: 100 - sx + 11,
    hy: sy + 8,
  });
  extras(sink, options);
};
