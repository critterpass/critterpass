import type { Point } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import { ellipsePolygon, superellipseArc } from '../../../core/shapes';
import { CRITTER_INK, mirrorX } from '../helpers';
import type { ArchetypeColors } from '../types';
import type { CritterSpec } from '../../../data/types';

/** design/critters-draw-2.js `A.bird`, the pre-wash decorations drawn before the body wash: peacock fan, rooster comb, tail forks, magpie/pheasant tail, hoopoe crest, owl ear tufts, humming-wing blur. */
export function drawBirdPreWashDecorations(
  sink: OpSink,
  spec: Pick<CritterSpec, 'tail'>,
  colors: ArchetypeColors,
  v: string,
  isRaptor: boolean,
): void {
  if (v === 'peacock') {
    const fan: Point[] = [...superellipseArc(50, 62, 47, 46, 1, 3.3, 6.12, 16), [50, 64]];
    W(sink, fan, '#54d6a4', 2.2);
    for (let i = 0; i < 9; i++) {
      const a = 3.45 + i * 0.31;
      const x = 50 + Math.cos(a) * 38;
      const y = 62 + Math.sin(a) * 37;
      F(sink, ellipsePolygon(x, y, 4.2, 5, 10, a + 1.57), '#4f86ff', 1.4);
      sink.dot(x, y, 1.8, '#ffd84a');
    }
  }
  if (v === 'rooster') {
    const combParts: readonly [Point, Point, Point][] = [
      [
        [68, 60],
        [84, 46],
        [95, 54],
      ],
      [
        [70, 66],
        [89, 60],
        [95, 70],
      ],
      [
        [70, 72],
        [86, 74],
        [90, 84],
      ],
    ];
    const combColors = ['#e8453c', '#3a3466', '#ffd84a'];
    combParts.forEach((p, i) => {
      const color = combColors[i] ?? '#e8453c';
      sink.stroke(p, color, 6);
      sink.line(p, { w: 2 });
    });
  }
  if (spec.tail === 'fork' || isRaptor) {
    W(
      sink,
      [
        [45, 80],
        [41, 95],
        [50, 89],
        [59, 95],
        [55, 80],
      ],
      colors.dk,
      2.1,
    );
  }
  if (v === 'magpie' || v === 'pheasant') {
    const p: Point[] = [
      [60, 78],
      [75, 90],
      [95, 96],
      [80, 85],
      [66, 74],
    ];
    W(sink, p, v === 'magpie' ? '#3a3466' : '#c4623e', 2.1);
    if (v === 'pheasant') {
      sink.line(
        [
          [66, 82],
          [80, 89],
          [90, 92],
        ],
        { w: 1.4 },
      );
    }
  }
  if (v === 'hoopoe') {
    for (let i = 0; i < 5; i++) {
      const a = -2.5 + i * 0.42;
      const tip: Point = [50 + Math.cos(a) * 19, 20 + Math.sin(a) * 19];
      W(
        sink,
        [
          [50 + Math.cos(a - 0.5) * 4, 20 + Math.sin(a - 0.5) * 4],
          tip,
          [50 + Math.cos(a + 0.5) * 4, 20 + Math.sin(a + 0.5) * 4],
        ],
        colors.f,
        1.8,
      );
      sink.dot(tip[0] - Math.cos(a) * 1.6, tip[1] - Math.sin(a) * 1.6, 2.2, CRITTER_INK);
    }
  }
  if (v === 'owl') {
    const tuft: Point[] = [
      [31, 27],
      [27, 13],
      [40, 22],
    ];
    for (const [i, p] of [tuft, mirrorX(tuft)].entries()) {
      W(sink, i ? p : tuft, colors.f, 2.1);
    }
  }
  if (v === 'humming') {
    const p: Point[] = [
      [37, 48],
      [16, 30],
      [12, 40],
      [30, 54],
    ];
    const inner: Point[] = [
      [10, 30],
      [6, 34],
    ];
    for (const i of [0, 1]) {
      W(sink, i ? mirrorX(p) : p, '#e6fbff', 1.8);
      sink.line(i ? mirrorX(inner) : inner, { w: 1.4 });
    }
  }
}
