/**
 * One-tap fixes: move a flexible item to the nearest start on the 15-minute grid where it clashes
 * with nobody's other items, the travel either side fits, and its place is open. A locked item
 * (booked, or locked by someone) is never moved.
 *
 * A move that settles a clash stays close to what the day was (`settleClash`): first a start
 * within an hour and a half (right after the stop it ran into), then the two stops swapped, then
 * the nearest start in the same part of the day, then anywhere in the day. And it never sends a stop to an hour its
 * place is not for (the draft's day rules): a lunch stays a lunch, a dinner a dinner, and a stop
 * in the open air is not moved into the dark. Where no such start exists there is no one-tap fix.
 */
import { openThrough, type ChangeSetOp, type OpenSpan } from '@cp/domain';

import { GRID_MIN } from '../draft/day-minutes';
import { mealAt } from '../draft/meal-slots';
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

/**
 * The nearest feasible start to the item's own, `later` only, `earlier` only, or either way;
 * `allowed` narrows the starts tried (a part of the day, the hours the place is for).
 */
export function feasibleStart(
  model: DayModel,
  item: ModelItem,
  travel: FitTravel,
  spans: readonly OpenSpan[] | null,
  direction: 'later' | 'earlier' | 'either',
  allowed: (start: number) => boolean = () => true,
): number | null {
  if (item.locked) return null;
  const duration = item.end - item.start;
  for (let step = GRID_MIN; step <= LATEST - EARLIEST; step += GRID_MIN) {
    const later = item.start + step;
    const earlier = item.start - step;
    if (
      direction !== 'earlier' &&
      later + duration <= LATEST &&
      allowed(later) &&
      fits(model, item, later, travel, spans)
    ) {
      return later;
    }
    if (
      direction !== 'later' &&
      earlier >= EARLIEST &&
      allowed(earlier) &&
      fits(model, item, earlier, travel, spans)
    ) {
      return earlier;
    }
  }
  return null;
}

/** What the check knows of the stop being moved, for the hours its place is for. */
export interface MovedStop {
  /** The plan item's category (`meal` for a lunch or dinner). */
  readonly category: string | null;
  readonly outdoor: boolean;
  /** Local minute the open air is dark from. */
  readonly darkFromMin: number;
}

const NOON = 12 * 60;
const EVENING = 17 * 60 + 30;
/** A move this near the stop's own start keeps the day as it was planned. */
const CLOSE_MIN = 90;
const partOf = (minute: number) => (minute < NOON ? 0 : minute < EVENING ? 1 : 2);

/** Whether `start` is an hour the stop's place is for, given where the stop is now. */
export function suitsPlace(item: ModelItem, what: MovedStop, start: number): boolean {
  const end = start + (item.end - item.start);
  if (what.category === 'meal') {
    const now = mealAt(item.start);
    // A meal stays the meal it is; one already between meals may only move into a meal time.
    return now === null ? mealAt(start) !== null : mealAt(start) === now;
  }
  // In the open air: done before dark, unless it is an evening stop already.
  if (what.outdoor && item.start < what.darkFromMin) return end <= what.darkFromMin;
  return true;
}

export interface ClashMove {
  readonly item: ModelItem;
  readonly start: number;
}

/**
 * The moves that settle a clash between `first` and the stop after it, `second`, nearest to the
 * day as it was: `second` to a start within an hour and a half of its own (right after the stop it
 * ran into); else the two swapped; else `second` to the closest start in its own part of the day;
 * else `second` (then `first`) to the closest start that day. Always an hour the place is for;
 * null when there is none.
 */
export function settleClash(
  model: DayModel,
  first: ModelItem,
  second: ModelItem,
  travel: FitTravel,
  about: (item: ModelItem) => { spans: readonly OpenSpan[] | null; what: MovedStop },
): ClashMove[] | null {
  const near = (item: ModelItem, within: (start: number) => boolean): number | null => {
    const { spans, what } = about(item);
    return feasibleStart(
      model,
      item,
      travel,
      spans,
      'either',
      (start) => suitsPlace(item, what, start) && within(start),
    );
  };
  const close = near(second, (start) => Math.abs(start - second.start) <= CLOSE_MIN);
  if (close !== null) return [{ item: second, start: close }];
  const swapped = swap(model, first, second, travel, about);
  if (swapped !== null) return swapped;
  const samePart = near(second, (start) => partOf(start) === partOf(second.start));
  if (samePart !== null) return [{ item: second, start: samePart }];
  for (const item of [second, first]) {
    const start = near(item, () => true);
    if (start !== null) return [{ item, start }];
  }
  return null;
}

/** `second` at the hour `first` had and `first` straight after it, when both fit there. */
function swap(
  model: DayModel,
  first: ModelItem,
  second: ModelItem,
  travel: FitTravel,
  about: (item: ModelItem) => { spans: readonly OpenSpan[] | null; what: MovedStop },
): ClashMove[] | null {
  if (first.locked || second.locked) return null;
  const moved = (item: ModelItem, start: number): ModelItem => ({
    ...item,
    start,
    end: start + (item.end - item.start),
  });
  const without = (ids: readonly string[]): DayModel => ({
    ...model,
    items: model.items.filter((item) => !ids.includes(item.stableId)),
  });
  const lead = moved(second, first.start);
  const ride = legMinutes(travel, second, first);
  const after = Math.ceil((lead.end + ride) / GRID_MIN) * GRID_MIN;
  const rest = without([first.stableId, second.stableId]);
  const ok = (item: ModelItem, start: number, others: DayModel) => {
    const { spans, what } = about(item);
    return (
      start + (item.end - item.start) <= LATEST &&
      suitsPlace(item, what, start) &&
      fits(others, item, start, travel, spans)
    );
  };
  const follow = moved(first, after);
  if (!ok(second, lead.start, { ...rest, items: [...rest.items, follow] })) return null;
  if (!ok(first, after, { ...rest, items: [...rest.items, lead] })) return null;
  return [
    { item: second, start: lead.start },
    { item: first, start: after },
  ];
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
