import { F, type OpSink } from '../../../core/ops';
import { ellipsePolygon } from '../../../core/shapes';
import { mirrorX, starPolygon } from '../helpers';
import type { ArchetypeColors } from '../types';

/** design/critters-draw-1.js `PAT` (used by `sit` only): coat markings keyed by `spec.pat`, drawn with `(sink, colors, headY, bodyHalfWidth)`. */
type PatternFn = (sink: OpSink, colors: ArchetypeColors, headY: number, bodyHalfWidth: number) => void;

function drawTabby(sink: OpSink, colors: ArchetypeColors, hy: number, bw: number): void {
  for (const l of [
    [[44, hy - 17.5], [45, hy - 11]],
    [[50, hy - 18.5], [50, hy - 11.5]],
    [[56, hy - 17.5], [55, hy - 11]],
  ] as const) {
    sink.stroke(l, colors.dk, 3);
  }
  for (const l of [
    [[51 - bw, 63], [57 - bw, 65]],
    [[50 - bw, 72], [57 - bw, 73]],
  ] as const) {
    sink.stroke(l, colors.dk, 3);
    sink.stroke(mirrorX(l), colors.dk, 3);
  }
}

const PAT: Readonly<Record<string, PatternFn>> = {
  tabby: drawTabby,
  stripes: (sink, colors, hy, bw) => {
    drawTabby(sink, colors, hy, bw);
    for (const l of [
      [[26, hy + 1], [33, hy + 2.5]],
      [[27, hy + 7], [33, hy + 7]],
      [[51 - bw, 80], [56 - bw, 81]],
    ] as const) {
      sink.stroke(l, colors.dk, 2.8);
      sink.stroke(mirrorX(l), colors.dk, 2.8);
    }
  },
  spots: (sink, colors, hy) => {
    for (const [x, y] of [
      [37, 60], [63, 58], [36, 74], [64, 72], [41, hy - 12], [59, hy - 12], [31, hy + 3], [69, hy + 3],
    ] as const) {
      sink.dot(x, y, 1.8, colors.dk, 0.9);
    }
  },
  dalmatian: (sink, colors, hy) => {
    for (const [x, y, r] of [
      [36, 60, 3], [63, 62, 2.4], [33, 76, 2.6], [67, 75, 3], [58, 85, 2], [42, 85, 2.2],
      [40, hy - 11, 2.6], [62, hy - 13, 2], [31, hy + 3, 2.2], [69, hy + 5, 2.8],
    ] as const) {
      sink.fill(ellipsePolygon(x, y, r, r * 0.9, 10), colors.dk);
    }
  },
  rosettes: (sink, colors, hy) => {
    for (const [x, y] of [
      [36, 61], [64, 59], [34, 75], [66, 73], [41, hy - 12], [59, hy - 12], [31, hy + 4], [69, hy + 4],
    ] as const) {
      sink.line(ellipsePolygon(x, y, 2.3, 2, 8), { w: 1.5, close: true, color: colors.dk });
    }
  },
  stars: (sink) => {
    for (const [x, y] of [
      [36, 63],
      [63, 66],
      [44, 82],
      [58, 80],
    ] as const) {
      F(sink, starPolygon(x, y, 3.6), '#ffd84a', 1.4);
    }
  },
  moon: (sink) =>
    sink.fill(
      [
        [37, 53],
        [50, 61],
        [63, 53],
        [61.5, 58],
        [50, 66.5],
        [38.5, 58],
      ],
      '#efe6d2',
    ),
  ridge: (sink, colors, hy) =>
    sink.stroke(
      [
        [50, hy - 18.5],
        [50, hy - 8],
      ],
      colors.dk,
      4.5,
    ),
  bristle: (sink, colors, hy) => {
    for (const [x, y] of [
      [44, hy - 17.5],
      [50, hy - 18.8],
      [56, hy - 17.5],
    ] as const) {
      sink.line(
        [
          [x, y],
          [x + (x - 50) * 0.12, y - 4.5],
        ],
        { w: 1.8 },
      );
    }
  },
};

/** design/critters-draw-1.js `PAT[s.pat]` dispatch, used only by `X.A.sit`. */
export function drawPattern(
  sink: OpSink,
  type: string | undefined,
  colors: ArchetypeColors,
  headY: number,
  bodyHalfWidth: number,
): void {
  const fn = type !== undefined ? PAT[type] : undefined;
  fn?.(sink, colors, headY, bodyHalfWidth);
}
