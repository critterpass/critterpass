// Tokek's actual draw calls, split out of gecko-ops.ts to stay under the ≤300-line file budget
// (code-standards.md §2). Ported from design/doodles.js `K.gecko`, unchanged stroke order.
import { ellipsePoints } from './geometry';
import type { Point } from './geometry';
import type { DrawContext, GeckoPalette } from './gecko-ops';

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) throw new Error(`gecko-draw: index ${index} out of range (length ${items.length})`);
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

/** Ported from doodles.js `K.gecko`: body/head washes, spot underlays, ink lines, face. */
export function drawGecko(ctx: DrawContext, ink: string, o: Required<Pick<GeckoPalette, 'pose'>> & GeckoPalette): void {
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
  (
    [
      [[44, 55], [50, 57], [56, 55]],
      [[43, 63], [50, 65.5], [57, 63]],
      [[45, 71], [50, 73], [55, 71]],
      [[60, 91], [62, 86]],
      [[74, 92], [73, 86]],
      [[84, 83], [79, 81]],
    ] as Point[][]
  ).forEach((b) => ctx.stroke(b, spot, 2.6));
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
