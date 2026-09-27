import type { Point } from '../../core/geometry';
import { ellipsePolygon } from '../../core/shapes';
import type { KindFn } from '../registry';
import { toes } from '../parts/face';

type Limb = readonly [Point, Point, Point];

/** design/doodles.js `K.gecko`: bespoke eyes (pupil shifts for `think`/`point`, unlike the shared `eyes` helper). */
export const gecko: KindFn = (sink, options) => {
  const ink = options.ink;
  const body = options.fill ?? '#a9d08c';
  const cheekColor = options.accent ?? '#ec8f72';
  const pose = options.pose ?? 'idle';

  const bodyOutline: Point[] = [
    [44, 41],
    [40, 53],
    [40, 67],
    [45, 77],
    [55, 77],
    [60, 67],
    [60, 53],
    [56, 41],
  ];
  const head: Point[] = [
    [29, 29],
    [34, 19],
    [50, 13.5],
    [66, 19],
    [71, 29],
    [65, 38.5],
    [50, 42.5],
    [35, 38.5],
  ];
  const tail: Point[] = [
    [52, 76],
    [56, 87],
    [66, 93.5],
    [79, 91],
    [87, 81],
    [84, 70],
    [76, 67.5],
    [71, 73],
    [75, 79],
  ];

  let armL: Limb = [
    [43, 49],
    [33, 50],
    [25, 43],
  ];
  let armR: Limb = [
    [57, 49],
    [67, 50],
    [75, 43],
  ];
  if (pose === 'wave') {
    armR = [
      [57, 49],
      [69, 43],
      [73, 30],
    ];
  }
  if (pose === 'cheer') {
    armL = [
      [43, 48],
      [32, 40],
      [28, 28],
    ];
    armR = [
      [57, 48],
      [68, 40],
      [72, 28],
    ];
  }
  if (pose === 'think') {
    armR = [
      [57, 49],
      [65, 45],
      [60, 38.5],
    ];
  }
  if (pose === 'point') {
    armR = [
      [57, 49],
      [70, 49],
      [83, 45],
    ];
  }
  const legL: Limb = [
    [43, 70],
    [33, 74],
    [27, 84],
  ];
  const legR: Limb = [
    [57, 70],
    [67, 74],
    [73, 84],
  ];

  sink.wash(bodyOutline, body);
  sink.wash(head, body);
  sink.stroke(tail, body, 9);

  const spot = options.spot ?? '#6f9f5a';
  for (const strap of [
    [
      [44, 55],
      [50, 57],
      [56, 55],
    ],
    [
      [43, 63],
      [50, 65.5],
      [57, 63],
    ],
    [
      [45, 71],
      [50, 73],
      [55, 71],
    ],
    [
      [60, 91],
      [62, 86],
    ],
    [
      [74, 92],
      [73, 86],
    ],
    [
      [84, 83],
      [79, 81],
    ],
  ] as const) {
    sink.stroke(strap, spot, 2.6);
  }

  sink.line(head, { w: 2.7, close: true });
  sink.line([...bodyOutline.slice(0, 4), [50, 77.5]], { w: 2.5 });
  sink.line([[50, 77.5], ...bodyOutline.slice(4)], { w: 2.5 });
  sink.line(tail, { w: 2.5, taper: true });
  for (const limb of [armL, armR, legL, legR]) {
    sink.line(limb, { w: 2.5, taper: false });
    toes(sink, limb, ink);
  }

  const closed = options.closed || pose === 'sleep';
  const eyeColor = options.eye;
  for (const [x, y] of [
    [31, 24],
    [69, 24],
  ] as const) {
    if (closed) {
      sink.line(
        [
          [x - 5, y + 1],
          [x, y + 3.6],
          [x + 5, y + 1],
        ],
        { w: 2.4 },
      );
      continue;
    }
    sink.fill(ellipsePolygon(x, y, 7.4, 7.4, 14), eyeColor);
    sink.line(ellipsePolygon(x, y, 7.4, 7.4, 14), { w: 2.3, close: true });
    const lx = pose === 'think' ? 2 : pose === 'point' ? 2.4 : 0;
    const ly = pose === 'think' ? -1.8 : 0;
    sink.fill(ellipsePolygon(x + lx, y + 0.5 + ly, 1.9, 4.6, 10), options.pupil);
    sink.dot(x + lx - 1.6, y - 2 + ly, 1.2, eyeColor);
  }

  sink.dot(46.5, 20.5, 0.9, ink);
  sink.dot(53.5, 20.5, 0.9, ink);
  sink.dot(36, 35, 3.2, cheekColor, 0.5);
  sink.dot(64, 35, 3.2, cheekColor, 0.5);

  if (pose === 'cheer') {
    sink.fill(
      [
        [41, 31.5],
        [50, 38.5],
        [59, 31.5],
        [50, 33.5],
      ],
      ink,
    );
  } else {
    sink.line(
      [
        [40, 32],
        [50, 36],
        [60, 32],
      ],
      { w: 2.1 },
    );
  }
  if (pose === 'think') {
    sink.dot(80, 12, 1.8, ink);
    sink.dot(87, 5, 2.6, ink);
  }
  if (pose === 'wave') {
    sink.line(
      [
        [80, 26],
        [84, 20],
      ],
      { w: 1.8 },
    );
    sink.line(
      [
        [82, 34],
        [88, 31],
      ],
      { w: 1.8 },
    );
  }
  if (pose === 'cheer') {
    sink.line(
      [
        [16, 22],
        [11, 18],
      ],
      { w: 2 },
    );
    sink.line(
      [
        [20, 14],
        [18, 7],
      ],
      { w: 2 },
    );
    sink.line(
      [
        [84, 22],
        [89, 18],
      ],
      { w: 2 },
    );
    sink.line(
      [
        [80, 14],
        [82, 7],
      ],
      { w: 2 },
    );
  }
  if (pose === 'sleep') {
    sink.line(
      [
        [78, 8],
        [86, 8],
        [78, 16],
        [86, 16],
      ],
      { w: 2 },
    );
  }
};
