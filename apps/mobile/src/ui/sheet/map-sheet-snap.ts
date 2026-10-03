/**
 * Where a map sheet settles. The sheet over a live map (7a-1 peek → 7a-2 half → 7a-3 full) rests
 * at one of a few visible heights; a release lands on the nearest one, and a fling moves past the
 * position it was let go at to the next height in the fling's direction.
 */
import { DRAG_DISMISS_COMMIT_VELOCITY_PT_PER_MS } from '@/motion/gestures/drag-dismiss';

export const MAP_SHEET_SNAPS = ['peek', 'half', 'full'] as const;
export type MapSheetSnap = (typeof MAP_SHEET_SNAPS)[number];

/** Points per millisecond: a release at least this fast is a fling (design-system.md §3.3). */
export const MAP_SHEET_FLING_PT_PER_MS = DRAG_DISMISS_COMMIT_VELOCITY_PT_PER_MS;

/** 7a-1: the sheet's top sits at 544 of 844 pt. */
export const PEEK_FRACTION = 300 / 844;
/** 7a-2: the sheet's top sits at 392 of 844 pt. */
export const HALF_FRACTION = 452 / 844;

/** Layout rounding: a height this close to a snap counts as being at it. */
const AT_SNAP_PT = 1;

/**
 * The index in `points` (visible heights, ascending) the sheet settles at. `position` is the
 * visible height at release; `velocity` is in pt/ms, positive downwards (the gesture's own sign),
 * so a negative velocity raises the sheet.
 */
export function resolveSnap(position: number, velocity: number, points: readonly number[]): number {
  'worklet';
  if (points.length === 0) return 0;
  const last = points.length - 1;
  if (velocity <= -MAP_SHEET_FLING_PT_PER_MS) {
    for (let index = 0; index <= last; index += 1) {
      if ((points[index] ?? 0) > position + AT_SNAP_PT) return index;
    }
    return last;
  }
  if (velocity >= MAP_SHEET_FLING_PT_PER_MS) {
    for (let index = last; index >= 0; index -= 1) {
      if ((points[index] ?? 0) < position - AT_SNAP_PT) return index;
    }
    return 0;
  }
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= last; index += 1) {
    const distance = Math.abs((points[index] ?? 0) - position);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/**
 * The visible heights of the three snaps for a screen. Peek is the 7a-1 render's sheet top (about
 * 300 pt on an 844 pt screen) scaled by the screen's height; half is the 7a-2 sheet (about 450 pt);
 * full leaves `topInset` of the map showing (7a-3). Content shorter than a snap caps it: the sheet
 * never rises past what it holds, so a short day at half snaps to the content.
 */
export function mapSheetHeights(
  screenHeight: number,
  topInset: number,
  contentHeight?: number,
): readonly [number, number, number] {
  const screenFull = Math.max(0, screenHeight - topInset);
  const full = contentHeight === undefined ? screenFull : Math.min(screenFull, contentHeight);
  const peek = Math.min(full, Math.round(screenHeight * PEEK_FRACTION));
  const half = Math.min(full, Math.max(peek, Math.round(screenHeight * HALF_FRACTION)));
  return [peek, half, full];
}
