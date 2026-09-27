// Tokek (the gecko) draw calls, ported from design/doodles.js `K.gecko` — same centreline maths and
// stroke order as the untouched design source (a port, not an import: the source is a DOM custom
// element). Not a route — see the default export at the bottom.
import type { Point } from './critter-geometry';
import { catmullRomSpline, ellipsePoints, polylineLength } from './critter-geometry';

export type GeckoPose = 'idle' | 'wave' | 'cheer' | 'think' | 'point' | 'sleep';

export interface GeckoPalette {
  readonly ink?: string;
  readonly fill?: string;
  readonly accent?: string;
  readonly spot?: string;
  readonly eye?: string;
  readonly pupil?: string;
  readonly pose?: GeckoPose;
  readonly closed?: boolean;
}

export type DrawOp =
  | { readonly kind: 'wash'; readonly points: Point[]; readonly color: string; readonly alpha: number; readonly offset: number; readonly seed: number }
  | { readonly kind: 'under'; readonly points: Point[]; readonly color: string; readonly width: number; readonly seed: number }
  | { readonly kind: 'fill'; readonly points: Point[]; readonly color: string; readonly alpha: number }
  | { readonly kind: 'line'; readonly points: Point[]; readonly length: number; readonly color: string; readonly width: number; readonly taper: boolean; readonly close: boolean; readonly seed: number };

interface LineOptions {
  readonly w?: number;
  readonly color?: string;
  readonly close?: boolean;
  readonly taper?: boolean;
}

interface DrawContext {
  line(points: readonly Point[], opts?: LineOptions): void;
  stroke(points: readonly Point[], color: string, width: number): void;
  wash(points: readonly Point[], color: string, opts?: { al?: number; off?: number }): void;
  fill(points: readonly Point[], color: string, alpha?: number): void;
  dot(x: number, y: number, r: number, color: string, alpha?: number): void;
}

function createDrawContext(seedStart: number, ink: string): { ctx: DrawContext; ops: DrawOp[] } {
  const ops: DrawOp[] = [];
  let seed = seedStart;
  const ctx: DrawContext = {
    line(points, opts = {}) {
      const close = opts.close === true;
      const p = catmullRomSpline(points, close);
      ops.push({
        kind: 'line',
        points: p,
        length: polylineLength(p),
        color: opts.color ?? ink,
        width: opts.w ?? 3,
        taper: opts.taper !== false && !close,
        close,
        seed: seed++,
      });
    },
    stroke(points, color, width) {
      const p = catmullRomSpline(points, false);
      ops.push({ kind: 'under', points: p, color, width, seed: seed++ });
    },
    wash(points, color, opts = {}) {
      ops.push({ kind: 'wash', points: catmullRomSpline(points, true), color, alpha: opts.al ?? 0.9, offset: opts.off ?? 1.6, seed: seed++ });
    },
    fill(points, color, alpha = 1) {
      ops.push({ kind: 'fill', points: catmullRomSpline(points, true), color, alpha });
    },
    dot(x, y, r, color, alpha = 1) {
      ops.push({ kind: 'fill', points: ellipsePoints(x, y, r, r, 10), color, alpha });
    },
  };
  return { ctx, ops };
}

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) throw new Error(`critter-gecko-ops: index ${index} out of range (length ${items.length})`);
  return value;
}

/** Toe dots at a limb's end, ported from doodles.js `toes`. */
function drawToes(ctx: DrawContext, a: Point, b: Point, ink: string): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const m = Math.hypot(dx, dy) || 1;
  const ux = dx / m;
  const uy = dy / m;
  const px = -uy;
  const py = ux;
  ([[-1, 1], [0, 2], [1, 1]] as const).forEach(([s, f]) => {
    ctx.dot(b[0] + ux * f * 1.7 + px * s * 2.9, b[1] + uy * f * 1.7 + py * s * 2.9, 2.2, ink);
  });
}

/** Ported from doodles.js `K.gecko`, unchanged stroke order. */
function drawGecko(ctx: DrawContext, ink: string, o: Required<Pick<GeckoPalette, 'pose'>> & GeckoPalette): void {
  const body = o.fill ?? '#a9d08c';
  const cheek = o.accent ?? '#ec8f72';
  const eye = o.eye ?? '#fffdf6';
  const pupil = o.pupil ?? ink;
  const pose = o.pose;

  const bodyP: Point[] = [[44, 41], [40, 53], [40, 67], [45, 77], [55, 77], [60, 67], [60, 53], [56, 41]];
  const head: Point[] = [[29, 29], [34, 19], [50, 13.5], [66, 19], [71, 29], [65, 38.5], [50, 42.5], [35, 38.5]];
  const tail: Point[] = [[52, 76], [56, 87], [66, 93.5], [79, 91], [87, 81], [84, 70], [76, 67.5], [71, 73], [75, 79]];
  let armL: Point[] = [[43, 49], [33, 50], [25, 43]];
  let armR: Point[] = [[57, 49], [67, 50], [75, 43]];
  if (pose === 'wave') armR = [[57, 49], [69, 43], [73, 30]];
  if (pose === 'cheer') {
    armL = [[43, 48], [32, 40], [28, 28]];
    armR = [[57, 48], [68, 40], [72, 28]];
  }
  if (pose === 'think') armR = [[57, 49], [65, 45], [60, 38.5]];
  if (pose === 'point') armR = [[57, 49], [70, 49], [83, 45]];
  const legL: Point[] = [[43, 70], [33, 74], [27, 84]];
  const legR: Point[] = [[57, 70], [67, 74], [73, 84]];

  ctx.wash(bodyP, body);
  ctx.wash(head, body);
  ctx.stroke(tail, body, 9);
  const spot = o.spot ?? '#6f9f5a';
  ([[[44, 55], [50, 57], [56, 55]], [[43, 63], [50, 65.5], [57, 63]], [[45, 71], [50, 73], [55, 71]], [[60, 91], [62, 86]], [[74, 92], [73, 86]], [[84, 83], [79, 81]]] as Point[][]).forEach((b) =>
    ctx.stroke(b, spot, 2.6),
  );
  ctx.line(head, { w: 2.7, close: true });
  ctx.line([...bodyP.slice(0, 4), [50, 77.5]], { w: 2.5 });
  ctx.line([[50, 77.5], ...bodyP.slice(4)], { w: 2.5 });
  ctx.line(tail, { w: 2.5, taper: true });
  [armL, armR, legL, legR].forEach((limb) => {
    ctx.line(limb, { w: 2.5, taper: false });
    drawToes(ctx, at(limb, limb.length - 2), at(limb, limb.length - 1), ink);
  });
  const closed = o.closed === true || pose === 'sleep';
  ([[31, 24], [69, 24]] as Point[]).forEach(([x, y]) => {
    if (closed) {
      ctx.line([[x - 5, y + 1], [x, y + 3.6], [x + 5, y + 1]], { w: 2.4 });
      return;
    }
    ctx.fill(ellipsePoints(x, y, 7.4, 7.4, 14), eye);
    ctx.line(ellipsePoints(x, y, 7.4, 7.4, 14), { w: 2.3, close: true });
    const lx = pose === 'think' ? 2 : pose === 'point' ? 2.4 : 0;
    const ly = pose === 'think' ? -1.8 : 0;
    ctx.fill(ellipsePoints(x + lx, y + 0.5 + ly, 1.9, 4.6, 10), pupil);
    ctx.dot(x + lx - 1.6, y - 2 + ly, 1.2, eye);
  });
  ctx.dot(46.5, 20.5, 0.9, ink);
  ctx.dot(53.5, 20.5, 0.9, ink);
  ctx.dot(36, 35, 3.2, cheek, 0.5);
  ctx.dot(64, 35, 3.2, cheek, 0.5);
  if (pose === 'cheer') ctx.fill([[41, 31.5], [50, 38.5], [59, 31.5], [50, 33.5]], ink);
  else ctx.line([[40, 32], [50, 36], [60, 32]], { w: 2.1 });
  if (pose === 'think') {
    ctx.dot(80, 12, 1.8, ink);
    ctx.dot(87, 5, 2.6, ink);
  }
  if (pose === 'wave') {
    ctx.line([[80, 26], [84, 20]], { w: 1.8 });
    ctx.line([[82, 34], [88, 31]], { w: 1.8 });
  }
  if (pose === 'cheer') {
    ctx.line([[16, 22], [11, 18]], { w: 2 });
    ctx.line([[20, 14], [18, 7]], { w: 2 });
    ctx.line([[84, 22], [89, 18]], { w: 2 });
    ctx.line([[80, 14], [82, 7]], { w: 2 });
  }
  if (pose === 'sleep') ctx.line([[78, 8], [86, 8], [78, 16], [86, 16]], { w: 2 });
}

export interface GeckoDrawing {
  readonly ops: readonly DrawOp[];
  readonly totalLineLength: number;
}

const DEFAULT_INK = '#221e19';
/** Fixed op-seed so two builds with the same palette/pose produce byte-identical geometry. */
const OP_SEED_START = 7;

/** Builds Tokek's draw-op list for one pose/palette; pure and deterministic. */
export function buildGeckoDrawing(palette: GeckoPalette = {}): GeckoDrawing {
  const ink = palette.ink ?? DEFAULT_INK;
  const { ctx, ops } = createDrawContext(OP_SEED_START, ink);
  drawGecko(ctx, ink, { pose: 'idle', ...palette });
  const totalLineLength = ops.reduce((sum, op) => (op.kind === 'line' ? sum + op.length : sum), 0) || 1;
  return { ops, totalLineLength };
}

// See critter-geometry.ts's header: not a screen, only a math helper living next to route files.
export default {};
