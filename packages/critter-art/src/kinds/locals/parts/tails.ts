import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import { W } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { ellipsePolygon, fluffPolygon, superellipseArc } from '../../../core/shapes';
import type { CritterSpec } from '../../../data/types';
import type { ArchetypeColors } from '../types';

/**
 * design/critters-draw-1.js `TAIL` (used by `sit` only): one of a washed wide tail (`w`), a stroked
 * ribbon tail (`s`, optionally ringed), a tuft-tipped tail (`l`, optionally a second tuft), a plain
 * ink line (`c`), a puffball (`pf`), or the hard-coded curl-up (`cu`).
 */
type TailShape =
  | { readonly w: readonly Point[]; readonly tip?: Point; readonly sc?: true }
  | {
      readonly s: readonly Point[];
      readonly sw: number;
      readonly ring?: number;
      readonly col?: string;
    }
  | {
      readonly l: readonly Point[];
      readonly tf: Point;
      readonly l2?: readonly Point[];
      readonly tf2?: Point;
    }
  | { readonly c: readonly Point[] }
  | { readonly pf: readonly [number, number, number] }
  | { readonly cu: true };

const TAIL: Readonly<Record<string, TailShape>> = {
  bushy: {
    w: [
      [68, 84],
      [80, 89],
      [91, 81],
      [94, 67],
      [87, 59],
      [79, 63],
      [74, 72],
    ],
    tip: [90.5, 63.5],
  },
  big: {
    w: [
      [67, 85],
      [82, 86],
      [92, 72],
      [88, 54],
      [93, 38],
      [85, 27],
      [74, 32],
      [77, 48],
      [71, 62],
    ],
  },
  plume: {
    w: [
      [67, 68],
      [74, 57],
      [85, 55],
      [91, 63],
      [86, 72],
      [75, 76],
    ],
  },
  pango: {
    w: [
      [64, 86],
      [80, 92],
      [93, 84],
      [95, 70],
      [88, 64],
      [84, 74],
      [74, 80],
    ],
    sc: true,
  },
  thin: {
    s: [
      [68, 84],
      [81, 88],
      [90, 79],
      [89, 66],
    ],
    sw: 6,
  },
  ringthin: {
    s: [
      [68, 84],
      [81, 88],
      [90, 79],
      [89, 66],
    ],
    sw: 6,
    ring: 3,
  },
  ring: {
    s: [
      [67, 84],
      [81, 89],
      [92, 78],
      [92, 62],
      [87, 52],
    ],
    sw: 9,
    ring: 4,
  },
  long: {
    s: [
      [68, 84],
      [84, 89],
      [94, 77],
      [92, 59],
      [84, 53],
      [81, 59],
    ],
    sw: 5,
  },
  otter: {
    s: [
      [66, 85],
      [80, 91],
      [94, 87],
    ],
    sw: 9,
  },
  rat: {
    s: [
      [66, 86],
      [80, 93],
      [93, 88],
      [96, 76],
    ],
    sw: 3.4,
    col: '#ffb8c8',
  },
  tuft: {
    l: [
      [68, 84],
      [82, 87],
      [88, 75],
    ],
    tf: [89, 71],
  },
  twin: {
    l: [
      [68, 84],
      [82, 87],
      [88, 75],
    ],
    tf: [89, 71],
    l2: [
      [67, 80],
      [77, 76],
      [79, 63],
    ],
    tf2: [79.5, 59],
  },
  curl: {
    c: [
      [69, 82],
      [77, 80],
      [79, 74],
      [74.5, 72],
      [73, 77],
    ],
  },
  puff: { pf: [72, 84, 6] },
  stub: { pf: [71.5, 82.5, 4.5] },
  curlup: { cu: true },
};

/** design/critters-draw-1.js `tail`: the whole tail shifts with the body's half-width `bw` (`dx = (bw - 21) * .9`). */
export function drawTail(
  sink: OpSink,
  type: string | undefined,
  colors: ArchetypeColors,
  spec: Pick<CritterSpec, 'tt' | 'tc' | 'mc'>,
  bodyHalfWidth: number,
): void {
  const shape = type !== undefined ? TAIL[type] : undefined;
  if (!shape) return;
  const dx = (bodyHalfWidth - 21) * 0.9;
  const shift = (points: readonly Point[]): Point[] => points.map(([x, y]): Point => [x + dx, y]);

  if ('w' in shape) {
    const p = shift(shape.w);
    sink.wash(p, colors.f);
    if (shape.tip) {
      sink.wash(
        ellipsePolygon(shape.tip[0] + dx, shape.tip[1], 5, 6, 10, 0.5),
        spec.tt || colors.bl,
      );
    }
    if (shape.sc) {
      for (const [x, y] of [
        [84, 86],
        [90, 76],
        [78, 88],
      ] as const) {
        sink.line(superellipseArc(x + dx, y, 3.6, 3, 1, 0.3, 2.84, 5), {
          w: 1.4,
          color: colors.dk,
        });
      }
    }
    sink.line(p, { w: 2.3 });
  }
  if ('s' in shape) {
    const p = shift(shape.s);
    sink.stroke(p, spec.tc || shape.col || colors.f, shape.sw);
    if (shape.ring !== undefined) {
      for (let i = 1; i < p.length; i++) {
        const a = pointAt(p, i - 1);
        const b = pointAt(p, i);
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const dx2 = b[0] - a[0];
        const dy2 = b[1] - a[1];
        const m = Math.hypot(dx2, dy2) || 1;
        const h = shape.sw * 0.55;
        sink.stroke(
          [
            [mx - (dy2 / m) * h, my + (dx2 / m) * h],
            [mx + (dy2 / m) * h, my - (dx2 / m) * h],
          ],
          colors.dk,
          shape.ring,
        );
      }
    }
    sink.line(p, { w: 2.2, taper: true });
  }
  if ('l' in shape) {
    sink.line(shift(shape.l), { w: 2.2 });
    W(sink, ellipsePolygon(shape.tf[0] + dx, shape.tf[1], 4.3, 5.3, 10), spec.mc || colors.dk, 2);
    if (shape.l2 && shape.tf2) {
      sink.line(shift(shape.l2), { w: 2.2 });
      W(sink, ellipsePolygon(shape.tf2[0] + dx, shape.tf2[1], 4, 5, 10), spec.mc || colors.dk, 2);
    }
  }
  if ('c' in shape) sink.line(shift(shape.c), { w: 2.2 });
  if ('pf' in shape) {
    const [px, py, pr] = shape.pf;
    W(sink, fluffPolygon(px + dx, py, pr, pr, 5, 0.15), type === 'puff' ? colors.bl : colors.f, 2);
  }
  if ('cu' in shape) {
    W(sink, ellipsePolygon(74 + dx, 66, 8.5, 8, 12), colors.f, 2.2);
    sink.line(
      [
        [70 + dx, 66],
        [74 + dx, 62],
        [78 + dx, 66],
        [74 + dx, 69],
      ],
      { w: 1.6 },
    );
  }
}
