/**
 * One-tap fixes: move a flexible item to the nearest start on the 15-minute grid where it clashes
 * with nobody's other items, the travel either side fits, and its place is open. A locked item
 * (booked, or locked by someone) is never moved.
 */
import { openThrough, type ChangeSetOp, type OpenSpan } from '@cp/domain';

import { GRID_MIN } from '../draft/day-minutes';
import { instantAt } from '../draft/schedule-day';
import type { FitTravel } from '../fit/context';
import { overlaps, type DayModel, type ModelItem } from '../fit/day-model';

const EARLIEST = 6 * 60;
const LATEST = 23 * 60;

function legMinutes(travel: FitTravel, a: ModelItem, b: ModelItem): number {
  if (a.point === null || b.point === null) return 0;
  return travel({ key: a.stableId, ...a.point }, { key: b.stableId, ...b.point })?.minutes ?? 0;
}

function fits(
  model: DayModel,
  item: ModelItem,
  start: number,
  travel: FitTravel,
  spans: readonly OpenSpan[] | null,
): boolean {
  const end = start + (item.end - item.start);
  if (spans !== null && openThrough(spans, start, end) === null) return false;
  const people = [...item.people];
  for (const other of model.items) {
    if (other.stableId === item.stableId || !people.some((uid) => other.people.has(uid))) continue;
    if (overlaps(other, start, end)) return false;
    if (other.end <= start && start - other.end < legMinutes(travel, other, item)) return false;
    if (other.start >= end && other.start - end < legMinutes(travel, item, other)) return false;
  }
  return true;
}

/** The nearest feasible start to the item's own, `later` only, `earlier` only, or either way. */
export function feasibleStart(
  model: DayModel,
  item: ModelItem,
  travel: FitTravel,
  spans: readonly OpenSpan[] | null,
  direction: 'later' | 'earlier' | 'either',
): number | null {
  if (item.locked) return null;
  const duration = item.end - item.start;
  for (let step = GRID_MIN; step <= LATEST - EARLIEST; step += GRID_MIN) {
    const later = item.start + step;
    const earlier = item.start - step;
    if (
      direction !== 'earlier' &&
      later + duration <= LATEST &&
      fits(model, item, later, travel, spans)
    ) {
      return later;
    }
    if (direction !== 'later' && earlier >= EARLIEST && fits(model, item, earlier, travel, spans)) {
      return earlier;
    }
  }
  return null;
}

export function retimeOp(
  model: DayModel,
  item: ModelItem,
  start: number,
  tz: string,
  reason: string,
): ChangeSetOp {
  const at = (minute: number) => instantAt(model.day.date, minute, tz).toISOString();
  const end = start + (item.end - item.start);
  return {
    op: 'retime',
    target: item.stableId,
    before: { starts_at: at(item.start), ends_at: at(item.end) },
    after: { starts_at: at(start), ends_at: at(end) },
    reason,
    affected_user_ids: [...item.people].sort(),
    booking_impact: false,
  };
}
