import type { Point } from '../../core/geometry';
import type { OpSink } from '../../core/ops';
import { ellipsePolygon, fluffPolygon, tubeOutline } from '../../core/shapes';
import type { KindDrawOptions, KindFn } from '../registry';
import { cheeks, extras, isShut } from '../parts/face';

type Limb = readonly [Point, Point, Point];

/**
 * Red-shanked douc langur of the Sơn Trà peninsula. The tells that must survive small sizes: the
 * golden-orange face ringed by white whiskers, the maroon "red socks" and the white forearms. Slots:
 * `fill` grey coat, `spot` black (thighs, hands, feet, brow), `belly` white (forearms, whiskers,
 * tail), `leaf` face, `stripe` socks, `accent` blush.
 */
export const langur: KindFn = (sink, options) => {
  const coat = options.fill ?? '#aea8c2';
  const black = options.spot ?? '#3a3466';
  const white = options.belly ?? '#fffaf0';
  const face = options.leaf ?? '#ffb347';
  const socks = options.stripe ?? '#b8323a';
  const pose = options.pose ?? 'idle';

  const tail: Point[] = [
    [60, 84],
    [73, 90],
    [85, 85],
    [89, 73],
    [85, 62],
    [88, 53],
    [94, 51],
  ];
  const body: Point[] = [
    [38, 50],
    [31, 62],
    [30, 76],
    [35, 86],
    [65, 86],
    [70, 76],
    [69, 62],
    [62, 50],
  ];

  const [armL, armR] = arms(pose);
  const legs: readonly Limb[] = [
    [
      [42, 80],
      [41.5, 88],
      [41, 94],
    ],
    [
      [58, 80],
      [58.5, 88],
      [59, 94],
    ],
  ];

  const tailTube = tubeOutline(tail, 6.4, 3.6).polygon;
  sink.wash(tailTube, white, { off: 0.4 });
  sink.line(tailTube, { w: 2.2, close: true });

  // Legs: black thighs, red socks, black feet.
  for (const [hip, knee, ankle] of legs) {
    sink.fill(ellipsePolygon(ankle[0], ankle[1] + 1.6, 5.6, 3, 10), black);
    const thigh = tubeOutline([hip, knee], 8.4, 8).polygon;
    const sock = tubeOutline([knee, ankle], 8, 7.4).polygon;
    sink.fill(thigh, black);
    sink.fill(sock, socks);
    sink.line(tubeOutline([hip, knee, ankle], 8.4, 7.4).polygon, { w: 2.2, close: true });
  }

  sink.wash(body, coat);
  sink.line(body, { w: 2.4 });

  for (const arm of [armL, armR]) limb(sink, arm, { coat, white, black });

  head(sink, options, { coat, black, white, face });
  poseMarks(sink, options, pose);
};

function arms(pose: string): readonly [Limb, Limb] {
  let armL: Limb = [
    [36, 56],
    [29, 66],
    [30, 76],
  ];
  let armR: Limb = [
    [64, 56],
    [71, 66],
    [70, 76],
  ];
  if (pose === 'wave') {
    armR = [
      [64, 56],
      [74, 50],
      [78, 38],
    ];
  }
  if (pose === 'cheer') {
    armL = [
      [36, 55],
      [26, 48],
      [22, 36],
    ];
    armR = [
      [64, 55],
      [74, 48],
      [78, 36],
    ];
  }
  if (pose === 'think') {
    armR = [
      [64, 56],
      [72, 58],
      [64, 50],
    ];
  }
  if (pose === 'point') {
    armR = [
      [64, 56],
      [75, 58],
      [87, 54],
    ];
  }
  return [armL, armR];
}

interface LimbColours {
  readonly coat: string;
  readonly white: string;
  readonly black: string;
}

/** Grey upper arm, white forearm, black hand. */
function limb(sink: OpSink, [shoulder, elbow, hand]: Limb, colours: LimbColours): void {
  sink.fill(tubeOutline([shoulder, elbow], 7, 6.4).polygon, colours.coat);
  sink.fill(tubeOutline([elbow, hand], 6.4, 6).polygon, colours.white);
  sink.line(tubeOutline([shoulder, elbow, hand], 7, 6).polygon, { w: 2.1, close: true });
  sink.fill(ellipsePolygon(hand[0], hand[1], 3.8, 3.8, 10), colours.black);
}

interface HeadColours {
  readonly coat: string;
  readonly black: string;
  readonly white: string;
  readonly face: string;
}

function head(sink: OpSink, options: KindDrawOptions, colours: HeadColours): void {
  const pose = options.pose ?? 'idle';
  const skull = ellipsePolygon(50, 28, 23, 19, 16);
  const ruff = fluffPolygon(50, 38.5, 24.5, 12.5, 9, 0.16);
  const mask: Point[] = [
    [35, 25],
    [42, 22],
    [50, 23.5],
    [58, 22],
    [65, 25],
    [65.5, 33],
    [59, 42.5],
    [50, 46],
    [41, 42.5],
    [34.5, 33],
  ];
  const brow: Point[] = [
    [34, 24.5],
    [41, 18.5],
    [50, 20],
    [59, 18.5],
    [66, 24.5],
    [58, 22],
    [50, 23.5],
    [42, 22],
  ];

  sink.wash(skull, colours.coat);
  sink.fill(ruff, colours.white);
  sink.line(ruff, { w: 2.2, close: true });
  sink.line([...skull.slice(7, 16), ...skull.slice(0, 2)], { w: 2.5 });
  sink.fill(mask, colours.face);
  sink.fill(brow, colours.black);
  sink.line(mask, { w: 2, close: true });
  sink.line(
    [
      [47, 10.5],
      [49, 5.5],
      [51, 10],
      [54, 6.5],
    ],
    { w: 2 },
  );

  almondEyes(sink, options);

  sink.dot(47.8, 36.5, 0.95, options.ink);
  sink.dot(52.2, 36.5, 0.95, options.ink);
  if (pose === 'cheer') {
    sink.fill(
      [
        [44, 39.5],
        [50, 44.5],
        [56, 39.5],
        [50, 41],
      ],
      options.ink,
    );
  } else {
    sink.line(
      [
        [45.5, 40],
        [50, 42.5],
        [54.5, 40],
      ],
      { w: 1.9 },
    );
  }
  cheeks(
    sink,
    options,
    [
      [38.5, 37],
      [61.5, 37],
    ],
    2.6,
  );
}

/**
 * Slanted almond eyes, outer corners up. Open and shut both draw exactly one `line` per eye so a
 * blink never shifts the seeded wobble of anything drawn after them.
 */
function almondEyes(sink: OpSink, options: KindDrawOptions): void {
  const shut = isShut(options);
  const pose = options.pose ?? 'idle';
  for (const [x, y, tilt] of [
    [42.5, 30, 0.24],
    [57.5, 30, -0.24],
  ] as const) {
    if (shut) {
      sink.line(
        [
          [x - 4.6, y + 0.4 - tilt * 4],
          [x, y + 2.6],
          [x + 4.6, y + 0.4 + tilt * 4],
        ],
        { w: 2.2 },
      );
      continue;
    }
    const outline = almond(x, y, 5.4, 3.9, tilt);
    sink.fill(outline, options.eye);
    sink.line(outline, { w: 2, close: true });
    const lx = pose === 'think' ? 1.3 : pose === 'point' ? 1.6 : 0;
    const ly = pose === 'think' ? -1 : 0;
    sink.fill(ellipsePolygon(x + lx, y + 0.3 + ly, 2.5, 2.9, 10), options.pupil);
    sink.dot(x + lx - 0.9, y - 1 + ly, 0.8, options.eye);
  }
}

/** A lens with pointed corners, rotated by `tilt` radians about its centre. */
function almond(cx: number, cy: number, rx: number, ry: number, tilt: number): Point[] {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  return Array.from({ length: 14 }, (_, i): Point => {
    const a = (i / 14) * Math.PI * 2;
    const s = Math.sin(a);
    const x = Math.cos(a) * rx;
    const y = s * ry * (0.35 + 0.65 * Math.abs(s));
    return [cx + x * cos - y * sin, cy + x * sin + y * cos];
  });
}

function poseMarks(sink: OpSink, options: KindDrawOptions, pose: string): void {
  if (pose === 'wave') {
    sink.line(
      [
        [84, 32],
        [88, 26],
      ],
      { w: 1.8 },
    );
    sink.line(
      [
        [86, 40],
        [92, 37],
      ],
      { w: 1.8 },
    );
  }
  extras(sink, options);
}
