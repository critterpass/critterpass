import { DEFAULT_INK } from '../../core/model';
import { F } from '../../core/ops';
import type { OpSink } from '../../core/ops';
import { ellipsePolygon, fluffPolygon } from '../../core/shapes';
import type { Point } from '../../core/geometry';

// New helpers from design/critters-draw-1.js's `X.h`. The shared math (arcB/blob/fluff/bez/crs/tube)
// lives in ../../core/shapes, `shut`/`dotEyes`/`iris` in ../parts/face, and `W`/`F` in ../../core/ops
// — all already ported; this file only adds what those modules don't already cover.

/** design/critters-draw-1.js `INK`: the hard-coded nose/eye ink, independent of the palette's `ink`. */
export const CRITTER_INK: string = DEFAULT_INK;

/** design/critters-draw-1.js `CR`: cream-white used for teeth, horns and eye highlights. */
export const CREAM_WHITE = '#fffaf0';

/** design/critters-draw-1.js's hard-coded cheek-blush pink; locals ignore the `accent` attribute. */
const CHEEK_PINK = '#ff7fa8';

/** design/critters-draw-1.js `MIR`: mirrors points across the 100-unit local space's centreline. */
export function mirrorX(points: readonly Point[]): Point[] {
  return points.map(([x, y]): Point => [100 - x, y]);
}

export interface HeadFrame {
  readonly x: number;
  readonly y: number;
  readonly k: number;
}

/** design/critters-draw-1.js `TR`: places head-local points at a head frame, optionally mirrored. */
export function transformHeadLocal(
  points: readonly Point[],
  head: HeadFrame,
  mirror: boolean,
): Point[] {
  return points.map(([x, y]): Point => [head.x + (mirror ? -x : x) * head.k, head.y + y * head.k]);
}

/** design/critters-draw-1.js `star`: a 5-point star polygon (accessory badges, coat patterns). */
export function starPolygon(x: number, y: number, r: number): Point[] {
  return Array.from({ length: 10 }, (_, i): Point => {
    const a = -1.5708 + (i * Math.PI) / 5;
    const q = i % 2 ? r * 0.45 : r;
    return [x + Math.cos(a) * q, y + Math.sin(a) * q];
  });
}

/** design/critters-draw-1.js `heart`: an 8-point heart polygon (coat patterns, accessories). */
export function heartPolygon(x: number, y: number, r: number): Point[] {
  return [
    [x, y + r],
    [x - r, y - r * 0.1],
    [x - r * 0.8, y - r * 0.8],
    [x - r * 0.3, y - r * 0.9],
    [x, y - r * 0.45],
    [x + r * 0.3, y - r * 0.9],
    [x + r * 0.8, y - r * 0.8],
    [x + r, y - r * 0.1],
  ];
}

/** design/critters-draw-1.js `nose`: the small filled ink nose most archetypes share. */
export function drawNose(sink: OpSink, x: number, y: number, rx = 3.8, ry = 2.7): void {
  sink.fill(ellipsePolygon(x, y, rx, ry, 10), CRITTER_INK);
}

/** design/critters-draw-1.js `smile`: a shallow 3-point smile line, ink by default. */
export function drawSmile(
  sink: OpSink,
  x: number,
  y: number,
  w = 5,
  h = 2.5,
  color?: string,
): void {
  sink.line(
    [
      [x - w, y],
      [x, y + h],
      [x + w, y],
    ],
    { w: 2, ...(color !== undefined ? { color } : {}) },
  );
}

/** design/critters-draw-1.js `cheek`: soft blush dots; unlike guides, locals ignore `accent`. */
export function drawCheekDots(sink: OpSink, points: readonly Point[], r = 3): void {
  for (const [x, y] of points) sink.dot(x, y, r, CHEEK_PINK, 0.5);
}

/** design/critters-draw-1.js `bloom`: a small filled flower with a contrasting centre dot. */
export function drawBloom(
  sink: OpSink,
  x: number,
  y: number,
  color: string,
  centerColor: string,
): void {
  F(sink, fluffPolygon(x, y, 3.4, 3.4, 5, 0.45), color, 1.4);
  sink.dot(x, y, 1.3, centerColor);
}
