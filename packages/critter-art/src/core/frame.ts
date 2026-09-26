import type { Cmd, LayerShadow } from './cmd';
import { layerCmd, polyCmd, polylineCmd, ribbonPolyCmd } from './cmd';
import { pointAt, type Point } from './geometry';
import type { Model, StickerOutlineShape } from './model';
import { createRng } from './rng';

const STICKER_SHADOW: LayerShadow = { dy: 2.5, sigma: 2.5, color: 'rgba(0,0,0,.32)' };

/** design's `fa = clamp((p-.25)/.55)`: washes/fills fade in between p .25 and .8. */
function fadeAlpha(p: number): number {
  return Math.max(0, Math.min(1, (p - 0.25) / 0.55));
}

/** Number of leading points from `points` whose cumulative length first exceeds `budget`. */
function truncatedPointCount(points: readonly Point[], budget: number): number {
  let sum = 0;
  let i = 1;
  for (; i < points.length; i++) {
    const a = pointAt(points, i - 1);
    const b = pointAt(points, i);
    sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (sum > budget) break;
  }
  return Math.min(points.length, i + 1);
}

function stickerOutlineCmds(shapes: readonly StickerOutlineShape[], color: string): Cmd[] {
  const cmds: Cmd[] = [];
  for (const shape of shapes) {
    cmds.push(polylineCmd(shape.points, shape.closed, shape.width, 'round', color, 1, 'srcOver'));
    if (shape.fill) {
      cmds.push(polyCmd(shape.points, color, 1, 'srcOver'));
    }
  }
  return cmds;
}

/**
 * Renders one draw-on frame (design's `draw(p)`, minus the canvas calls): washes/under-strokes
 * fade in and multiply against the sticker (pass 1), then fills fade in and ink lines reveal by
 * arc-length budget at full opacity (pass 2, source-over) — matching the design's save/restore
 * discipline, under which revealed ink strokes are never alpha-faded, only length-truncated.
 * Everything comes back wrapped in one isolated layer so `multiply` never reaches the page behind
 * the critter, with the sticker die-cut nested in its own shadowed sub-layer.
 */
export function frame(model: Model, p: number): Cmd[] {
  if (p <= 0) return [];
  const fa = fadeAlpha(p);
  const bodyCmds: Cmd[] = [];

  for (const op of model.ops) {
    if (op.t === 'wash') {
      const random = createRng(op.seed);
      const dx = (random() - 0.5) * 2 * op.offset;
      const dy = (random() - 0.2) * op.offset;
      bodyCmds.push(polyCmd(op.points, op.color, op.alpha * fa, model.blend, { dx, dy }));
      bodyCmds.push(
        polylineCmd(op.points, true, 1.4, 'miter', op.color, 0.28 * fa, model.blend, { dx, dy }),
      );
    } else if (op.t === 'under') {
      bodyCmds.push(ribbonPolyCmd(op.ribbon.left, op.ribbon.right, op.color, 0.9 * fa, model.blend));
    }
  }

  let budget = p * model.totalArcLength * 1.02;
  for (const op of model.ops) {
    if (op.t === 'fill') {
      bodyCmds.push(polyCmd(op.points, op.color, op.alpha * (p >= 1 ? 1 : fa), 'srcOver'));
    } else if (op.t === 'line') {
      if (budget <= 0) continue;
      let { left, right } = op.ribbon;
      if (budget < op.arcLength) {
        const count = truncatedPointCount(op.points, budget);
        left = left.slice(0, count);
        right = right.slice(0, count);
      }
      budget -= op.arcLength;
      bodyCmds.push(ribbonPolyCmd(left, right, op.color, 1, 'srcOver'));
    }
  }

  const layers: Cmd[] = [];
  if (model.stickerOutline && model.stickerColor) {
    layers.push(
      layerCmd(
        stickerOutlineCmds(model.stickerOutline, model.stickerColor),
        Math.min(1, p * 4),
        STICKER_SHADOW,
      ),
    );
  }
  layers.push(...bodyCmds);

  return [layerCmd(layers, 1)];
}
