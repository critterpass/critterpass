import { CREAM_WHITE, mirrorX } from '../helpers';
import { F } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { blobPolygon, ellipsePolygon } from '../../../core/shapes';
import type { CritterSpec } from '../../../data/types';
import type { ArchetypeColors } from '../types';

/** design/critters-draw-1.js `MASK` (used by `sit` only): face-marking overlays, keyed by `spec.mask`. */
type MaskFn = (
  sink: OpSink,
  headY: number,
  colors: ArchetypeColors,
  spec: Pick<CritterSpec, 'fcol'>,
) => void;

const MASK: Readonly<Record<string, MaskFn>> = {
  raccoon: (sink, hy, colors) =>
    sink.fill(
      [
        [27, hy - 3],
        [38, hy - 7],
        [50, hy - 2.5],
        [62, hy - 7],
        [73, hy - 3],
        [71, hy + 5],
        [60, hy + 6.5],
        [50, hy + 2.5],
        [40, hy + 6.5],
        [29, hy + 5],
      ] as const,
      colors.dk,
    ),
  panda: (sink, hy, colors) => {
    sink.fill(ellipsePolygon(37.5, hy + 1.5, 7.2, 9.5, 12, 0.55), colors.dk);
    sink.fill(ellipsePolygon(62.5, hy + 1.5, 7.2, 9.5, 12, -0.55), colors.dk);
  },
  loris: (sink, hy, colors) => {
    sink.fill(ellipsePolygon(37.5, hy, 10.5, 11, 12), colors.dk);
    sink.fill(ellipsePolygon(62.5, hy, 10.5, 11, 12), colors.dk);
    sink.fill(
      [
        [48, hy - 18],
        [52, hy - 18],
        [52.6, hy + 7],
        [47.4, hy + 7],
      ],
      CREAM_WHITE,
    );
  },
  sloth: (sink, hy, colors) => {
    sink.fill(blobPolygon(50, hy + 2, 20, 14.5, 0.85, 14), colors.bl);
    const p = [
      [27, hy - 2],
      [38, hy - 5],
      [45.5, hy + 1],
      [43, hy + 5.5],
      [32, hy + 6],
    ] as const;
    sink.fill(p, colors.dk);
    sink.fill(mirrorX(p), colors.dk);
  },
  face: (sink, hy, colors, spec) =>
    sink.fill(blobPolygon(50, hy + 4, 17, 12.5, 0.85, 14), spec.fcol || colors.bl),
  akita: (sink, hy) => {
    sink.fill(blobPolygon(50, hy + 8, 19, 9, 0.8, 14), CREAM_WHITE);
    sink.dot(38, hy - 7.5, 2.6, CREAM_WHITE);
    sink.dot(62, hy - 7.5, 2.6, CREAM_WHITE);
  },
  stb: (sink, hy, colors) => {
    sink.fill(ellipsePolygon(37, hy - 1, 10, 9, 12, 0.3), colors.dk);
    sink.fill(ellipsePolygon(63, hy - 1, 10, 9, 12, -0.3), colors.dk);
  },
  beard: (sink, hy, colors) => {
    for (const m of [1, -1]) {
      F(
        sink,
        [
          [50 - 22 * m, hy + 4],
          [50 - 29 * m, hy + 11],
          [50 - 24 * m, hy + 11],
          [50 - 27 * m, hy + 16],
          [50 - 19 * m, hy + 12],
        ],
        colors.bl,
        1.8,
      );
    }
  },
  fringe: (sink, hy, colors) => {
    const p = [
      [27, hy - 6],
      [33, hy - 1],
      [38.5, hy - 6],
      [44, hy - 1.5],
      [50, hy - 6.5],
      [56, hy - 1.5],
      [61.5, hy - 6],
      [67, hy - 1],
      [73, hy - 6],
      [70, hy - 15],
      [50, hy - 19],
      [30, hy - 15],
    ] as const;
    sink.fill(p, colors.dk);
    sink.line(p.slice(0, 9), { w: 1.8 });
  },
};

/** design/critters-draw-1.js `MASK[s.mask]` dispatch, folded into one call by every archetype that supports face masks. */
export function drawMask(
  sink: OpSink,
  type: string | undefined,
  headY: number,
  colors: ArchetypeColors,
  spec: Pick<CritterSpec, 'fcol'>,
): void {
  const fn = type !== undefined ? MASK[type] : undefined;
  fn?.(sink, headY, colors, spec);
}
