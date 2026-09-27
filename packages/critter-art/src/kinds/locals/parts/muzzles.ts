import { CREAM_WHITE, CRITTER_INK, drawNose, drawSmile, mirrorX } from '../helpers';
import { F } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { ellipsePolygon, blobPolygon } from '../../../core/shapes';
import type { CritterSpec } from '../../../data/types';
import type { ArchetypeColors } from '../types';

/** design/critters-draw-1.js `MUZ` (used by `sit` only): the mouth/nose overlay, keyed by `spec.muz`, defaulting to `plain`. */
type MuzzleFn = (
  sink: OpSink,
  headY: number,
  colors: ArchetypeColors,
  spec: Pick<CritterSpec, 'snc' | 'tusks' | 'fcol' | 'ring'>,
) => void;

const MUZ: Readonly<Record<string, MuzzleFn>> = {
  plain: (sink, hy) => {
    drawNose(sink, 50, hy + 8.5);
    drawSmile(sink, 50, hy + 12.5);
  },
  dog: (sink, hy, colors) => {
    sink.fill(ellipsePolygon(50, hy + 10.5, 10.5, 7, 12), colors.bl);
    drawNose(sink, 50, hy + 7.5, 4.4, 3.1);
    sink.line(
      [
        [50, hy + 9.5],
        [50, hy + 12.5],
      ],
      { w: 1.8 },
    );
    sink.line(
      [
        [45, hy + 12],
        [47.5, hy + 14],
        [50, hy + 12.5],
        [52.5, hy + 14],
        [55, hy + 12],
      ],
      { w: 1.9 },
    );
  },
  cat: (sink, hy) => {
    sink.fill(
      [
        [47, hy + 7.5],
        [53, hy + 7.5],
        [50, hy + 10.2],
      ],
      '#ff8fae',
    );
    sink.line(
      [
        [45, hy + 11.5],
        [47.5, hy + 13.5],
        [50, hy + 11],
        [52.5, hy + 13.5],
        [55, hy + 11.5],
      ],
      { w: 1.9 },
    );
    for (const l of [
      [
        [35, hy + 9],
        [25, hy + 7],
      ],
      [
        [35, hy + 12],
        [26, hy + 13.5],
      ],
    ] as const) {
      sink.line(l, { w: 1.3 });
      sink.line(mirrorX(l), { w: 1.3 });
    }
  },
  long: (sink, hy, colors) => {
    sink.fill(
      [
        [39, hy + 2],
        [50, hy],
        [61, hy + 2],
        [58, hy + 11],
        [50, hy + 16.5],
        [42, hy + 11],
      ],
      colors.bl,
    );
    drawNose(sink, 50, hy + 12, 3.6, 2.6);
    sink.line(
      [
        [47, hy + 15.5],
        [50, hy + 17],
        [53, hy + 15.5],
      ],
      { w: 1.7 },
    );
  },
  snout: (sink, hy, colors, spec) => {
    const p = ellipsePolygon(50, hy + 10, 8.5, 6, 12);
    F(sink, p, spec.snc || '#ffb8c8', 2);
    sink.dot(47, hy + 10, 1.5, CRITTER_INK);
    sink.dot(53, hy + 10, 1.5, CRITTER_INK);
    drawSmile(sink, 50, hy + 16.5, 3.5, 1.6);
    if (spec.tusks) {
      for (const m of [1, -1]) {
        F(
          sink,
          [
            [50 - 9.5 * m, hy + 13],
            [50 - 12 * m, hy + 5],
            [50 - 7.5 * m, hy + 12],
          ],
          CREAM_WHITE,
          1.4,
        );
      }
    }
  },
  big: (sink, hy) => {
    sink.fill(blobPolygon(50, hy + 6, 5.5, 7.5, 0.9, 12), CRITTER_INK);
    sink.dot(48.4, hy + 3.5, 1.3, '#fffdf6');
    drawSmile(sink, 50, hy + 15, 4, 2);
  },
  flat: (sink, hy, colors) => {
    sink.fill(ellipsePolygon(50, hy + 10, 9.5, 6.5, 12), colors.dk);
    drawNose(sink, 50, hy + 8, 3.6, 2.5);
    sink.line(
      [
        [45.5, hy + 13],
        [50, hy + 14.5],
        [54.5, hy + 13],
      ],
      { w: 1.8, color: CREAM_WHITE },
    );
  },
  capy: (sink, hy, colors) => {
    sink.fill(blobPolygon(50, hy + 9, 12, 8, 0.7, 14), colors.dk);
    sink.dot(45.5, hy + 7.5, 1.5, CRITTER_INK);
    sink.dot(54.5, hy + 7.5, 1.5, CRITTER_INK);
    sink.line(
      [
        [46, hy + 12.5],
        [50, hy + 14],
        [54, hy + 12.5],
      ],
      { w: 1.8 },
    );
  },
  otter: (sink, hy, colors) => {
    sink.fill(ellipsePolygon(45.5, hy + 10, 5.8, 4.6, 10), colors.bl);
    sink.fill(ellipsePolygon(54.5, hy + 10, 5.8, 4.6, 10), colors.bl);
    sink.fill(
      [
        [46.5, hy + 5.5],
        [53.5, hy + 5.5],
        [50, hy + 9],
      ],
      CRITTER_INK,
    );
    for (const [x, y] of [
      [44, hy + 10],
      [42, hy + 12],
      [56, hy + 10],
      [58, hy + 12],
    ] as const) {
      sink.dot(x, y, 0.8, CRITTER_INK);
    }
  },
  rat: (sink, hy) => {
    sink.dot(50, hy + 9, 2.6, '#ff8fae');
    sink.line(
      [
        [47, hy + 12.5],
        [50, hy + 13.8],
        [53, hy + 12.5],
      ],
      { w: 1.7 },
    );
    for (const l of [
      [
        [40, hy + 9],
        [30, hy + 7],
      ],
      [
        [40, hy + 11.5],
        [31, hy + 13],
      ],
    ] as const) {
      sink.line(l, { w: 1.2 });
      sink.line(mirrorX(l), { w: 1.2 });
    }
  },
  bunny: (sink, hy) => {
    sink.fill(ellipsePolygon(50, hy + 8, 2.8, 2, 10), '#ff8fae');
    sink.line(
      [
        [50, hy + 10],
        [50, hy + 12],
      ],
      { w: 1.6 },
    );
    sink.line(
      [
        [46.5, hy + 12],
        [48.3, hy + 13.8],
        [50, hy + 12],
        [51.7, hy + 13.8],
        [53.5, hy + 12],
      ],
      { w: 1.7 },
    );
  },
  teeth: (sink, hy) => {
    drawNose(sink, 50, hy + 8.5, 3.6, 2.6);
    sink.line(
      [
        [45.5, hy + 11.5],
        [50, hy + 13],
        [54.5, hy + 11.5],
      ],
      { w: 1.9 },
    );
    F(
      sink,
      [
        [47.6, hy + 12.6],
        [52.4, hy + 12.6],
        [52.2, hy + 17],
        [47.8, hy + 17],
      ],
      CREAM_WHITE,
      1.5,
    );
    sink.line(
      [
        [50, hy + 13],
        [50, hy + 17],
      ],
      { w: 1.1 },
    );
  },
  // `spec.fcol` has no design-side fallback here; every critter using this muzzle sets it
  // (verified against design/critters-data.js), so `?? ''` only guards an unreachable type case.
  snub: (sink, hy, colors, spec) => {
    sink.fill(blobPolygon(50, hy + 2, 17, 13, 0.85, 14), spec.fcol ?? '');
    sink.dot(48.3, hy + 7.5, 1.3, CRITTER_INK);
    sink.dot(51.7, hy + 7.5, 1.3, CRITTER_INK);
    drawSmile(sink, 50, hy + 11, 4, 2);
  },
  monkey: (sink, hy, colors, spec) => {
    if (spec.ring) sink.fill(blobPolygon(50, hy + 2, 18.5, 16, 0.85, 14), CREAM_WHITE);
    for (const [x, y, a, b] of [
      [41, hy - 0.5, 9.5, 9],
      [59, hy - 0.5, 9.5, 9],
      [50, hy + 7.5, 12, 8],
    ] as const) {
      sink.fill(ellipsePolygon(x, y, a, b, 12), spec.fcol ?? '');
    }
    const lipColor = spec.ring ? CREAM_WHITE : CRITTER_INK;
    sink.dot(48.2, hy + 7, 1.2, lipColor);
    sink.dot(51.8, hy + 7, 1.2, lipColor);
    sink.line(
      [
        [46, hy + 11],
        [50, hy + 13],
        [54, hy + 11],
      ],
      { w: 1.8, color: lipColor },
    );
  },
  longnose: (sink, hy, colors) => {
    F(
      sink,
      [
        [45.5, hy + 3],
        [54.5, hy + 3],
        [53.5, hy + 14],
        [50, hy + 17.5],
        [46.5, hy + 14],
      ],
      colors.bl,
      1.9,
    );
    sink.fill(ellipsePolygon(50, hy + 15.5, 3.2, 2.3, 10), CRITTER_INK);
  },
};

/** design/critters-draw-1.js `(MUZ[s.muz || 'plain'] || MUZ.plain)(d, hy, C, s)`. */
export function drawMuzzle(
  sink: OpSink,
  type: string | undefined,
  headY: number,
  colors: ArchetypeColors,
  spec: Pick<CritterSpec, 'snc' | 'tusks' | 'fcol' | 'ring'>,
): void {
  const fn = (type !== undefined ? MUZ[type] : undefined) ?? MUZ['plain'];
  fn?.(sink, headY, colors, spec);
}
