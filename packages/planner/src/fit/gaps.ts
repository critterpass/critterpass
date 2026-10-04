/**
 * Free time in the plan: windows of an hour or more between 07:00 and 22:00 when two or more
 * people are free together, with who is free, where the others are and until when, and the next
 * fixed item. A window ends when its people have to leave for that item (the travel from where
 * they are), and a window inside a longer one for more of the crew is not repeated.
 */
import { GAP_MIN_MINUTES, type Gap } from '@cp/domain';

import { floorGrid } from '../draft/day-minutes';
import { travelOf, type FitContext, type FitDay, type FitStop } from './context';
import {
  buildDayModel,
  clockOf,
  nextItem,
  overlaps,
  previousItem,
  type DayModel,
  type ModelItem,
} from './day-model';

const EARLIEST = 7 * 60;
const LATEST = 22 * 60;

/** A gap with what gap ideas need to fill it. */
export interface DayGap {
  readonly gap: Gap;
  readonly model: DayModel;
  readonly fromMin: number;
  readonly toMin: number;
  readonly prev: ModelItem | null;
  readonly next: ModelItem | null;
}

interface Window {
  readonly who: readonly string[];
  readonly from: number;
  readonly to: number;
}

function freeAt(model: DayModel, start: number, end: number): readonly string[] {
  const busy = new Set(
    model.items.filter((item) => overlaps(item, start, end)).flatMap((item) => [...item.people]),
  );
  return model.everyone.filter((uid) => !busy.has(uid));
}

function windowsOf(model: DayModel, from: number, to: number): Window[] {
  const cuts = new Set([from, to]);
  for (const item of model.items) {
    if (item.start > from && item.start < to) cuts.add(item.start);
    if (item.end > from && item.end < to) cuts.add(item.end);
  }
  const bounds = [...cuts].sort((a, b) => a - b);
  const segments = bounds.slice(1).map((end, index) => {
    const start = bounds[index] as number;
    return { start, end, free: new Set(freeAt(model, start, end)) };
  });
  const found = new Map<string, Window>();
  segments.forEach((segment, index) => {
    if (segment.free.size < 2) return;
    const who = [...segment.free].sort();
    const holds = (other: (typeof segments)[number] | undefined) =>
      other !== undefined && who.every((uid) => other.free.has(uid));
    let first = index;
    while (holds(segments[first - 1])) first -= 1;
    let last = index;
    while (holds(segments[last + 1])) last += 1;
    const window = {
      who,
      from: segments[first]?.start ?? segment.start,
      to: segments[last]?.end ?? segment.end,
    };
    found.set(`${who.join(',')}@${window.from}`, window);
  });
  return [...found.values()];
}

const stopOf = (item: ModelItem | null, day: FitDay): FitStop | null => {
  if (item?.point) return { key: item.stableId, ...item.point };
  return item === null && day.stay !== null ? { key: 'stay', ...day.stay } : null;
};

function toDayGap(context: FitContext, model: DayModel, window: Window): DayGap | null {
  const prev = previousItem(model, window.from, window.who);
  const next = nextItem(model, window.to, window.who);
  let to = window.to;
  if (next !== null && next.start === window.to) {
    const from = stopOf(prev, model.day);
    const nextStop = stopOf(next, model.day);
    const leg = from !== null && nextStop !== null ? travelOf(context)(from, nextStop) : null;
    to = floorGrid(window.to - (leg?.minutes ?? 0));
  }
  if (to - window.from < GAP_MIN_MINUTES) return null;
  const others = new Set(model.everyone.filter((uid) => !window.who.includes(uid)));
  const busy = model.items
    .filter((item) => overlaps(item, window.from, to))
    .flatMap((item) => {
      const userIds = [...item.people].filter((uid) => others.has(uid)).sort();
      return userIds.length === 0
        ? []
        : [{ user_ids: userIds, stable_id: item.stableId, until: clockOf(item.end) }];
    });
  return {
    gap: {
      day_id: model.day.dayId,
      day_no: model.day.dayNo,
      from: clockOf(window.from),
      to: clockOf(to),
      minutes: to - window.from,
      who_free: [...window.who],
      busy,
      after_item: prev !== null && prev.end === window.from ? prev.stableId : null,
      next_item: next?.stableId ?? null,
    },
    model,
    fromMin: window.from,
    toMin: to,
    prev,
    next,
  };
}

function dominated(gap: DayGap, all: readonly DayGap[]): boolean {
  return all.some(
    (other) =>
      other !== gap &&
      other.fromMin <= gap.fromMin &&
      other.toMin >= gap.toMin &&
      gap.gap.who_free.every((uid) => other.gap.who_free.includes(uid)) &&
      (other.gap.who_free.length > gap.gap.who_free.length ||
        other.toMin - other.fromMin > gap.toMin - gap.fromMin),
  );
}

/** Every free window of the day, earliest first. */
export function dayGaps(context: FitContext, day: FitDay): DayGap[] {
  const model = buildDayModel(day, context.participants, context.tz);
  const from = Math.max(EARLIEST, day.fromMin);
  const to = Math.min(LATEST, day.toMin);
  if (to - from < GAP_MIN_MINUTES) return [];
  const gaps = windowsOf(model, from, to).flatMap((window) => {
    const gap = toDayGap(context, model, window);
    return gap === null ? [] : [gap];
  });
  return gaps
    .filter((gap) => !dominated(gap, gaps))
    .sort((a, b) => a.fromMin - b.fromMin || b.gap.who_free.length - a.gap.who_free.length);
}

/** The trip's free windows, day by day. */
export function findGaps(context: FitContext): Gap[] {
  return context.days.flatMap((day) => dayGaps(context, day).map((entry) => entry.gap));
}
