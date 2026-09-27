import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import { F } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { ellipsePolygon, fluffPolygon, superellipseArc } from '../../../core/shapes';
import type { CritterSpec } from '../../../data/types';
import { transformHeadLocal } from '../helpers';
import type { HeadFrame } from '../helpers';
import type { ArchetypeColors } from '../types';

/**
 * design/critters-draw-1.js `EAR`: three shapes share one loose record, discriminated at draw time
 * exactly as the design does (`e` = round ellipse ears, `front` = drawn over the head in a later
 * phase, otherwise a flap outline with an optional inner-ear fill).
 */
interface EarShape {
  readonly o?: readonly Point[];
  readonly i?: readonly Point[];
  readonly e?: readonly [number, number, number, number];
  readonly cl?: true;
  readonly tuft?: true;
  readonly fl?: true;
  readonly front?: true;
}

const EAR: Readonly<Record<string, EarShape>> = {
  cat: {
    o: [
      [-19, -8],
      [-21, -26],
      [-6, -17],
    ],
    i: [
      [-16.5, -12],
      [-18, -21.5],
      [-10.5, -16.5],
    ],
  },
  fox: {
    o: [
      [-20, -6],
      [-26, -30],
      [-5, -17],
    ],
    i: [
      [-17, -10],
      [-21.5, -24],
      [-9.5, -16],
    ],
  },
  fen: {
    o: [
      [-19, -5],
      [-37, -31],
      [-4, -17],
    ],
    i: [
      [-16, -10],
      [-30.5, -26],
      [-8.5, -16],
    ],
  },
  bat: {
    o: [
      [-18, -8],
      [-34, -29],
      [-7, -17],
    ],
    i: [
      [-16, -12],
      [-28, -24],
      [-10.5, -16],
    ],
  },
  big: {
    o: [
      [-21, -3],
      [-37, -18],
      [-9, -16],
    ],
    i: [
      [-18.5, -6],
      [-30.5, -16],
      [-12, -14.5],
    ],
  },
  pig: {
    o: [
      [-17, -12],
      [-25, -29],
      [-5, -18],
    ],
    i: [
      [-15, -15.5],
      [-20, -24],
      [-9, -18],
    ],
  },
  tuft: {
    o: [
      [-19, -8],
      [-21, -27],
      [-6, -17],
    ],
    i: [
      [-16.5, -12],
      [-18, -22],
      [-10.5, -16.5],
    ],
    tuft: true,
  },
  long: {
    o: [
      [-10, -14],
      [-16, -26],
      [-16, -38],
      [-11, -42],
      [-5, -35],
      [-4, -17],
    ],
    i: [
      [-9, -19],
      [-12.5, -28],
      [-12.5, -36],
      [-10, -38.5],
      [-7.5, -32.5],
      [-7, -20],
    ],
  },
  sheep: {
    o: [
      [-22, -5],
      [-37, -10],
      [-39, -3],
      [-24, 2],
    ],
    cl: true,
  },
  deer: {
    o: [
      [-19, -9],
      [-36, -19],
      [-32, -9],
      [-22, -3],
    ],
    cl: true,
  },
  side2: {
    o: [
      [-22, -6],
      [-36, -14],
      [-34, -5],
      [-24, 0],
    ],
    cl: true,
  },
  horse: {
    o: [
      [-11, -15],
      [-15, -31],
      [-4, -18],
    ],
  },
  llama: {
    o: [
      [-11, -15],
      [-17, -31],
      [-13, -38],
      [-7, -31],
      [-5, -17],
    ],
  },
  round: { e: [-19, -15, 8, 8] },
  mouse: { e: [-21, -14, 12, 12] },
  tiny: { e: [-17, -16, 4.8, 4.2] },
  koala: { e: [-24, -11, 12, 11], fl: true },
  side: { e: [-26, 1, 5.5, 7] },
  flop: {
    o: [
      [-19, -14],
      [-29, -10],
      [-31, 6],
      [-26, 14],
      [-19, 6],
    ],
    front: true,
  },
};

/**
 * design/critters-draw-1.js `ears`: drawn in three passes interleaved with the head fill/outline
 * (pass 0 = wash under the head, 1 = inner fill + outline, 2 = a flop ear drawn over the head).
 */
export function drawEars(
  sink: OpSink,
  type: string | undefined,
  head: HeadFrame,
  colors: ArchetypeColors,
  spec: Pick<CritterSpec, 'ec' | 'ic'>,
  phase: 0 | 1 | 2,
): void {
  const shape = type !== undefined ? EAR[type] : undefined;
  if (!shape) return;

  for (const mirror of [false, true]) {
    if (shape.e) {
      const [ex, ey, rx, ry] = shape.e;
      const [cx, cy] = pointAt(transformHeadLocal([[ex, ey]], head, mirror), 0);
      const a = rx * head.k;
      const b = ry * head.k;
      if (phase === 0) sink.wash(ellipsePolygon(cx, cy, a, b, 12), spec.ec || colors.f);
      if (phase === 1) {
        const theta = Math.atan2(head.y - cy, head.x - cx);
        const qx = cx - Math.cos(theta) * a * 0.15;
        const qy = cy - Math.sin(theta) * b * 0.15;
        if (shape.fl) {
          sink.fill(fluffPolygon(qx, qy, a * 0.58, b * 0.58, 5, 0.2), colors.bl);
        } else {
          sink.fill(ellipsePolygon(qx, qy, a * 0.5, b * 0.5, 10), spec.ic || colors.bl);
        }
        sink.line(superellipseArc(cx, cy, a, b, 1, theta + 1.15, theta + 5.13, 12), { w: 2.3 });
      }
      continue;
    }
    if (shape.front) {
      if (phase === 2 && shape.o) {
        F(sink, transformHeadLocal(shape.o, head, mirror), spec.ec || colors.dk, 2.2);
      }
      continue;
    }
    if (!shape.o) continue;
    const p = transformHeadLocal(shape.o, head, mirror);
    if (phase === 0) sink.wash(p, spec.ec || colors.f);
    if (phase === 1) {
      if (shape.i) sink.fill(transformHeadLocal(shape.i, head, mirror), spec.ic || colors.bl);
      sink.line(p, { w: 2.3, close: !!shape.cl });
      if (shape.tuft) {
        sink.line(
          transformHeadLocal(
            [
              [-21, -27],
              [-22, -34],
            ],
            head,
            mirror,
          ),
          { w: 2 },
        );
      }
    }
  }
}
