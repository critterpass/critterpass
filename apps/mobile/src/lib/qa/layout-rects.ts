import type { QaRect } from './header-overlap';

/** Window rectangles, in points, as the screen-wide layout checks read them (./layout-geometry). */

/** Anti-aliasing and rounding: edges this close only touch. */
export const TOUCH_PT = 1;
/** Two boxes must share more than this on both axes to count as drawn over each other. */
export const OVERLAP_PT = 2;
/**
 * A text's lines hold their line height: the share above the first line's glyphs and below the
 * last's that stacked labels (a field's caption over its value, the lines of a code) may share.
 */
export const LEADING_SHARE = 0.15;

export const right = (r: QaRect) => r.x + r.width;
export const bottom = (r: QaRect) => r.y + r.height;

/** How far two boxes share each axis (negative when apart). */
function shared(a: QaRect, b: QaRect): { dx: number; dy: number } {
  return {
    dx: Math.min(right(a), right(b)) - Math.max(a.x, b.x),
    dy: Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y),
  };
}

export function overlaps(a: QaRect, b: QaRect): boolean {
  const { dx, dy } = shared(a, b);
  return dx > OVERLAP_PT && dy > OVERLAP_PT;
}

/** The part two boxes share (empty when apart). */
export function intersect(a: QaRect, b: QaRect): QaRect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(right(a), right(b)) - x),
    height: Math.max(0, Math.min(bottom(a), bottom(b)) - y),
  };
}

export function contains(outer: QaRect, inner: QaRect): boolean {
  return (
    inner.x >= outer.x - TOUCH_PT &&
    inner.y >= outer.y - TOUCH_PT &&
    right(inner) <= right(outer) + TOUCH_PT &&
    bottom(inner) <= bottom(outer) + TOUCH_PT
  );
}

/** A text line as its layout event reports it: offsets from the text's own box. */
export interface QaLine {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where a text's glyphs draw: the span of its lines (a title's box may stretch the row while its
 * words take a part of it), without the leading above the first line and below the last. Without
 * lines, the box itself without that leading.
 */
export function inkOf(box: QaRect, lines?: readonly QaLine[]): QaRect {
  const drawn = (lines ?? []).filter((line) => line.width > 0 && line.height > 0);
  const first = drawn[0];
  const last = drawn.at(-1);
  if (first === undefined || last === undefined) {
    const leading = box.height * LEADING_SHARE;
    return { x: box.x, y: box.y + leading, width: box.width, height: box.height - leading * 2 };
  }
  const left = Math.min(...drawn.map((line) => line.x));
  const far = Math.max(...drawn.map((line) => line.x + line.width));
  const top = first.y + first.height * LEADING_SHARE;
  const foot = last.y + last.height * (1 - LEADING_SHARE);
  return { x: box.x + left, y: box.y + top, width: far - left, height: Math.max(0, foot - top) };
}

/** Drawn and at least partly inside the window. */
export function onScreen(r: QaRect, window: { width: number; height: number }): boolean {
  if (r.width <= TOUCH_PT || r.height <= TOUCH_PT) return false;
  const { dx, dy } = shared(r, { x: 0, y: 0, ...window });
  return dx > TOUCH_PT && dy > TOUCH_PT;
}

const round = (n: number) => String(Math.round(n));

export function describeRect(r: QaRect): string {
  return `x=${round(r.x)} y=${round(r.y)} w=${round(r.width)} h=${round(r.height)}`;
}

/** Room `inner` keeps from each edge of `outer` (negative past it). */
function insets(outer: QaRect, inner: QaRect): [string, number][] {
  return [
    ['top', inner.y - outer.y],
    ['bottom', bottom(outer) - bottom(inner)],
    ['left', inner.x - outer.x],
    ['right', right(outer) - right(inner)],
  ];
}

/** The sides of `inner` past `outer`, by how much: `bottom 6pt, right 12pt`. */
export function sidesPast(outer: QaRect, inner: QaRect): string[] {
  return insets(outer, inner)
    .filter(([, room]) => room < -TOUCH_PT)
    .map(([side, room]) => `${side} ${round(-room)}pt`);
}

/** The sides of `inner` closer than `least` to the edges of `outer`, with the room they keep. */
export function tightSides(outer: QaRect, inner: QaRect, least: number): string[] {
  return insets(outer, inner)
    .filter(([, room]) => room < least - TOUCH_PT)
    .map(([side, room]) => `${side} ${round(room)}pt`);
}
