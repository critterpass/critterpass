import type { Point } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import { blobPolygon, ellipsePolygon, superellipseArc } from '../../../core/shapes';
import { eyes, extras } from '../../parts/face';
import { CREAM_WHITE } from '../helpers';
import { drawSparkExtras, isEpicPose } from '../poses';
import type { ArchetypeFn } from '../types';
import { FSH } from './fish-shapes';
import { drawFishPattern } from './fish-pattern';

/** design/critters-draw-2.js `A.fish`: 10 critters across 8 named variants (`long` is also the default). */
export const fish: ArchetypeFn = (sink, options, spec, colors) => {
  const epicPose = isEpicPose(options.pose);
  const v = spec.v ?? 'long';
  const fish = FSH[v] ?? FSH['long'];
  if (!fish) throw new Error(`unknown fish variant "${v}"`);

  if (spec.acc === 'bag') {
    const bag: Point[] = [
      [50, 12],
      [30, 22],
      [20, 50],
      [24, 80],
      [50, 92],
      [76, 80],
      [80, 50],
      [70, 22],
    ];
    sink.wash(bag, '#e6f4ff', { al: 0.5 });
    sink.line(bag, { w: 1.8, close: true });
    sink.line(
      [
        [46, 12],
        [50, 6],
        [54, 12],
      ],
      { w: 1.8 },
    );
    sink.line(
      [
        [24, 58],
        [36, 56],
        [50, 58],
        [64, 56],
        [78, 58],
      ],
      { w: 1.4, color: '#6fa8ff' },
    );
  }
  // T8 epic pose (design gives `fish` no pose of its own): the top fin flicks up, where one exists.
  const finLift = epicPose ? 5 : 0;
  const topFin: readonly Point[] | undefined = (
    spec.fins === 'spiky'
      ? [
          [34, 29], [38, 11], [43, 26], [48, 8], [53, 24], [58, 9], [62, 25], [67, 13], [70, 30],
        ]
      : fish.fT
  )?.map(([x, y]): Point => [x, y - finLift]);
  sink.wash(fish.t, colors.f);
  if (topFin) sink.wash(topFin, colors.dk);
  if (fish.fB) sink.wash(fish.fB, colors.f);
  if (v === 'mud') {
    for (const [x, y, r] of [
      [80, 45, 5.5],
      [88, 47, 5],
    ] as const) {
      sink.wash(ellipsePolygon(x, y, r, r, 10), colors.f);
    }
  }
  sink.wash(fish.b, colors.f);
  if (v === 'long' || v === 'carp' || v === 'shark') {
    sink.fill(
      v === 'shark'
        ? [
            [18, 58],
            [40, 63],
            [68, 63],
            [86, 58],
            [66, 60],
            [40, 60],
          ]
        : [
            [26, 60],
            [44, 64.5],
            [64, 63.5],
            [79, 57],
            [62, 58],
            [42, 58.5],
          ],
      colors.bl,
    );
  }
  drawFishPattern(sink, spec.pat, colors);

  sink.line(fish.t, { w: 2.3, close: true });
  if (topFin) sink.line(topFin, { w: 2.1 });
  if (fish.fB) sink.line(fish.fB, { w: 2.1 });
  sink.line(fish.b, { w: 2.6, close: true });
  if (v === 'betta' || v === 'gold') {
    for (const l of [
      [[26, 50], [10, 34]],
      [[26, 52], [6, 54]],
      [[26, 54], [10, 72]],
    ] as const) {
      sink.line(l, { w: 1.3, color: colors.dk });
    }
  }
  if (fish.g) sink.line(fish.g, { w: 2 });
  if (v === 'shark') {
    for (const [x, y] of [
      [70, 45],
      [73, 45],
      [76, 46],
    ] as const) {
      sink.line(
        [
          [x, y],
          [x - 1, y + 9],
        ],
        { w: 1.5 },
      );
    }
  }
  if (v === 'puffer') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * 6.2832;
      const x = 54 + Math.cos(a) * 32;
      const y = 52 + Math.sin(a) * 29;
      if (x > 26) {
        sink.line(
          [
            [x, y],
            [x + Math.cos(a) * 4, y + Math.sin(a) * 4],
          ],
          { w: 1.8 },
        );
      }
    }
  }
  if (v === 'mud') {
    for (const [x, y, r] of [
      [80, 45, 5.5],
      [88, 47, 5],
    ] as const) {
      sink.line(superellipseArc(x, y, r, r, 1, 2.6, 6.8, 10), { w: 2 });
    }
    eyes(
      sink,
      options,
      [
        [80, 44.5],
        [88, 46.5],
      ],
      3.8,
    );
    W(
      sink,
      [
        [62, 73],
        [58, 83],
        [69, 80],
      ],
      colors.f,
      1.9,
    );
    sink.line(
      [
        [2, 86],
        [30, 83],
        [60, 85],
        [98, 83],
      ],
      { w: 2.4, color: '#8f6a4d' },
    );
  } else if (fish.e) {
    eyes(sink, options, [[fish.e[0], fish.e[1]]], fish.e[2]);
  }
  if (v === 'puffer') {
    F(sink, ellipsePolygon(86.5, 55, 2.6, 3, 8), '#ff8fae', 1.6);
  } else if (fish.m) {
    sink.line(fish.m, { w: 1.9 });
  }
  if (spec.teeth) {
    for (const [x, y] of [
      [84, 57.5],
      [86.5, 58.5],
    ] as const) {
      sink.fill(
        [
          [x - 1, y],
          [x + 1, y],
          [x, y + 2.4],
        ],
        CREAM_WHITE,
      );
    }
  }
  if (v === 'carp') {
    sink.line(
      [
        [88, 58],
        [94, 64],
        [96, 70],
      ],
      { w: 1.5 },
    );
    sink.line(
      [
        [86, 60],
        [89, 67],
      ],
      { w: 1.4 },
    );
  }
  const cheekCenter: Point = fish.e ? [fish.e[0], fish.e[1]] : [84, 50];
  sink.dot(cheekCenter[0] + 2, cheekCenter[1] + 10, 2.6, '#ff7fa8', 0.5);
  if (epicPose) drawSparkExtras(sink, cheekCenter[0] + 2, cheekCenter[1] - 16, 5, colors.dk);
  if (spec.acc === 'lantern') {
    sink.line(
      [
        [90, 55],
        [94, 42],
        [92, 30],
      ],
      { w: 1.2 },
    );
    F(sink, blobPolygon(91, 22, 5.5, 7, 0.7, 12), '#ff4a3d', 1.8);
    sink.line(
      [
        [86, 16.5],
        [96, 16.5],
      ],
      { w: 2, color: '#ffd84a' },
    );
    sink.line(
      [
        [86, 27.5],
        [96, 27.5],
      ],
      { w: 2, color: '#ffd84a' },
    );
    sink.line(
      [
        [91, 29],
        [91, 34],
      ],
      { w: 1.4, color: '#ffd84a' },
    );
  }
  extras(sink, options);
};
