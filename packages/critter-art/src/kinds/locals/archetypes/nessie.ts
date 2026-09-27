import type { Point } from '../../../core/geometry';
import { blobPolygon, catmullRomResample, tubeOutline } from '../../../core/shapes';
import { eyes, extras } from '../../parts/face';
import { drawCheekDots, drawSmile } from '../helpers';
import { drawSparkExtras, isEpicPose } from '../poses';
import type { ArchetypeFn } from '../types';

/** design/critters-draw-2.js `A.nessie`: 1 critter (Loch Ness). */
export const nessie: ArchetypeFn = (sink, options, _spec, colors) => {
  const epicPose = isEpicPose(options.pose);
  const hump1: Point[] = [
    [46, 81],
    [52, 68],
    [62, 62],
    [72, 66],
    [78, 81],
  ];
  const hump2: Point[] = [
    [81, 81],
    [85.5, 73],
    [91, 72],
    [95, 81],
  ];
  sink.wash(hump1, colors.f);
  sink.wash(hump2, colors.f);
  const neck = tubeOutline(catmullRomResample([[42, 81], [37, 64], [31, 48], [31, 36]], 3), 12, 10);
  sink.wash(neck.polygon, colors.f);
  const head = blobPolygon(34, 28, 13, 10.5, 0.85, 14);
  sink.wash(head, colors.f);
  for (const [x, y] of [
    [58, 70],
    [66, 68],
    [88, 76],
    [34, 58],
    [36, 70],
  ] as const) {
    sink.dot(x, y, 1.9, colors.dk, 0.9);
  }
  sink.line(hump1, { w: 2.4 });
  sink.line(hump2, { w: 2.3 });
  const n = neck.left.length;
  sink.line(neck.left.slice(0, n - 1), { w: 2.3 });
  sink.line(neck.right.slice(0, n - 1), { w: 2.3 });
  sink.line(head, { w: 2.5, close: true });
  // T8 epic pose (design gives `nessie` no pose of its own): the head crests reach up further.
  const crestExtra = epicPose ? 4 : 0;
  for (const [x, y] of [
    [29, 19],
    [39, 19],
  ] as const) {
    sink.line(
      [
        [x, y],
        [x, y - 4 - crestExtra],
      ],
      { w: 2.2 },
    );
    sink.dot(x, y - 5 - crestExtra, epicPose ? 2.6 : 2, colors.dk);
  }
  if (epicPose) drawSparkExtras(sink, 34, 8, 4.5, colors.dk);
  eyes(
    sink,
    options,
    [
      [29, 27],
      [40, 27],
    ],
    3.8,
  );
  drawSmile(sink, 34.5, 32.5, 3.2, 1.6);
  drawCheekDots(
    sink,
    [
      [24.5, 32],
      [44, 32],
    ],
    2.2,
  );
  sink.line(
    [
      [10, 82], [20, 79.5], [30, 82], [40, 79.5], [50, 82], [60, 79.5], [70, 82], [80, 79.5], [90, 82], [98, 80],
    ],
    { w: 2.1, color: '#6fa8ff' },
  );
  sink.line(
    [
      [24, 90],
      [36, 88],
      [48, 90],
      [60, 88],
      [72, 90],
    ],
    { w: 1.6, color: '#6fa8ff' },
  );
  extras(sink, options);
};
