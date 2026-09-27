import { pointAt, type Point } from '../../core/geometry';
import type { OpSink } from '../../core/ops';
import { ellipsePolygon } from '../../core/shapes';
import type { KindDrawOptions } from '../registry';

/** Shared by every eye-drawing helper: closed eyes (or the sleep pose) render as a lash line. */
export function isShut(options: Pick<KindDrawOptions, 'closed' | 'pose'>): boolean {
  return options.closed || options.pose === 'sleep';
}

/** design/doodles.js `eyes`: open almond eye with iris/pupil/highlight, or a closed lash line. */
export function eyes(
  sink: OpSink,
  options: Pick<KindDrawOptions, 'closed' | 'pose' | 'eye' | 'pupil'>,
  points: readonly Point[],
  r: number,
): void {
  for (const [x, y] of points) {
    if (isShut(options)) {
      sink.line(
        [
          [x - r * 0.75, y + 0.5],
          [x, y + r * 0.5],
          [x + r * 0.75, y + 0.5],
        ],
        { w: 2.2 },
      );
      continue;
    }
    const lx = options.pose === 'think' ? r * 0.3 : 0;
    const ly = options.pose === 'think' ? -r * 0.25 : 0;
    sink.fill(ellipsePolygon(x, y, r, r, 14), options.eye);
    sink.line(ellipsePolygon(x, y, r, r, 14), { w: 2.1, close: true });
    sink.fill(ellipsePolygon(x + lx, y + 0.3 + ly, r * 0.46, r * 0.52, 10), options.pupil);
    sink.dot(x + lx - r * 0.22, y - r * 0.26 + ly, r * 0.17, options.eye);
  }
}

/** design/doodles.js `cheeks`: soft blush dots, defaulting to the design's pink. */
export function cheeks(
  sink: OpSink,
  options: Pick<KindDrawOptions, 'accent'>,
  points: readonly Point[],
  r: number,
): void {
  for (const [x, y] of points) sink.dot(x, y, r, options.accent ?? '#ff7fa8', 0.5);
}

/** design/doodles.js `extras`: pose-only flourishes (cheer sparkles, sleep Z, think dots). */
export function extras(sink: OpSink, options: Pick<KindDrawOptions, 'pose' | 'ink'>): void {
  if (options.pose === 'cheer') {
    for (const line of [
      [
        [14, 24],
        [9, 20],
      ],
      [
        [18, 15],
        [16, 8],
      ],
      [
        [86, 24],
        [91, 20],
      ],
      [
        [82, 15],
        [84, 8],
      ],
    ] as const) {
      sink.line(line, { w: 2 });
    }
  }
  if (options.pose === 'sleep') {
    sink.line(
      [
        [80, 6],
        [88, 6],
        [80, 14],
        [88, 14],
      ],
      { w: 2 },
    );
  }
  if (options.pose === 'think') {
    sink.dot(86, 12, 1.8, options.ink);
    sink.dot(92, 5, 2.6, options.ink);
  }
}

/** design/doodles.js `toes`: three small pad dots at the end of a limb's last segment. */
export function toes(sink: OpSink, limb: readonly Point[], ink: string): void {
  const b = pointAt(limb, limb.length - 1);
  const a = pointAt(limb, limb.length - 2);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const m = Math.hypot(dx, dy) || 1;
  const ux = dx / m;
  const uy = dy / m;
  const px = -uy;
  const py = ux;
  for (const [s, f] of [
    [-1, 1],
    [0, 2],
    [1, 1],
  ] as const) {
    sink.dot(b[0] + ux * f * 1.7 + px * s * 2.9, b[1] + uy * f * 1.7 + py * s * 2.9, 2.2, ink);
  }
}

/**
 * design/critters-draw-1.js `dotEyes`: simple round pupil-only eyes (seal/dugong/naga). Design's
 * closed branch consumes one seed (`line`) the open branch never consumes (`fill`/`dot` don't), so
 * every later ribbon in the kind wobbles differently across a blink — `seedMode: 'stable'` reserves
 * a matching seed in the open branch so it doesn't; `seedMode: 'design'` (default, golden) replicates
 * the jitter exactly.
 */
export function dotEyes(
  sink: OpSink,
  options: Pick<KindDrawOptions, 'closed' | 'pose' | 'eye' | 'pupil' | 'seedMode'>,
  points: readonly Point[],
  r: number,
): void {
  for (const [x, y] of points) {
    if (isShut(options)) {
      sink.line(
        [
          [x - r, y],
          [x, y + r * 0.7],
          [x + r, y],
        ],
        { w: 2 },
      );
      continue;
    }
    sink.fill(ellipsePolygon(x, y, r, r * 1.1, 10), options.pupil);
    sink.dot(x - r * 0.35, y - r * 0.42, r * 0.36, options.eye);
    if (options.seedMode === 'stable') sink.reserveSeed();
  }
}

/** design/critters-draw-1.js `iris`: eye with a coloured iris ring (fish/lizards/snake). */
export function iris(
  sink: OpSink,
  options: Pick<KindDrawOptions, 'closed' | 'pose' | 'eye' | 'pupil'>,
  points: readonly Point[],
  r: number,
  color: string,
): void {
  for (const [x, y] of points) {
    if (isShut(options)) {
      sink.line(
        [
          [x - r * 0.8, y + 0.5],
          [x, y + r * 0.5],
          [x + r * 0.8, y + 0.5],
        ],
        { w: 2.2 },
      );
      continue;
    }
    sink.fill(ellipsePolygon(x, y, r, r, 14), color);
    sink.line(ellipsePolygon(x, y, r, r, 14), { w: 2.1, close: true });
    sink.fill(ellipsePolygon(x, y + 0.3, r * 0.42, r * 0.5, 10), options.pupil);
    sink.dot(x - r * 0.24, y - r * 0.3, r * 0.18, options.eye);
  }
}
