import type { SkPath } from '@shopify/react-native-skia';

/** The subset of `Skia.Path` this module needs — kept minimal so a test adapter (e.g. CanvasKit) can implement it without pulling in the rest of the real `PathFactory` surface. */
export interface PathFactoryLike {
  MakeFromCmds(cmds: number[][]): SkPath | null;
}

/** Uniform scale + translate, matching `viewportFor()`'s `(contentScale, padPx)` pair — the only kind of transform this renderer ever needs (design never rotates/skews the content box). */
export interface Transform2D {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

export const IDENTITY_TRANSFORM: Transform2D = { scale: 1, tx: 0, ty: 0 };

// Numeric values of `@shopify/react-native-skia`'s `PathVerb` enum (Move=0, Line=1, Close=5) —
// defined locally so this module never imports the real package at runtime, only its types.
const VERB_MOVE = 0;
const VERB_LINE = 1;
const VERB_CLOSE = 5;

function coord(pts: Float32Array, index: number): number {
  const value = pts[index];
  if (value === undefined) {
    throw new RangeError(
      `pathFromPoints: point index ${index} out of bounds (length ${pts.length})`,
    );
  }
  return value;
}

/**
 * Builds one `SkPath` from a flat `(x0,y0,x1,y1,...)` point array in a single
 * `Skia.Path.MakeFromCmds` call — the "no per-vertex JSI" contract: every vertex is packed into
 * one JS array (transformed to device pixels in plain JS first) that crosses the native bridge
 * once, instead of one bridge call per vertex (e.g. a `moveTo`/`lineTo` call sequence).
 */
export function pathFromPoints(
  factory: PathFactoryLike,
  pts: Float32Array,
  close: boolean,
  transform: Transform2D = IDENTITY_TRANSFORM,
  dx = 0,
  dy = 0,
): SkPath {
  if (pts.length < 2 || pts.length % 2 !== 0) {
    throw new RangeError(
      `pathFromPoints: expected a non-empty, even-length point array, got ${pts.length}`,
    );
  }
  const px = (i: number): number => (coord(pts, i) + dx) * transform.scale + transform.tx;
  const py = (i: number): number => (coord(pts, i + 1) + dy) * transform.scale + transform.ty;

  const cmds: number[][] = [[VERB_MOVE, px(0), py(0)]];
  for (let i = 2; i < pts.length; i += 2) {
    cmds.push([VERB_LINE, px(i), py(i)]);
  }
  if (close) cmds.push([VERB_CLOSE]);

  const path = factory.MakeFromCmds(cmds);
  if (!path) throw new Error('pathFromPoints: Skia.Path.MakeFromCmds returned null');
  return path;
}
