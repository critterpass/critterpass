/**
 * The pace a redraft was asked for, held in code whatever the guide answered. A slower or lighter
 * day never holds more stops than the day it redoes, nor as many activities: the stops nobody
 * asked for give way, those of the old day first (the new ones answer the ask), the latest first;
 * an essential, a must-do and a stop of the crew's never do. And a title that promises a late
 * morning ("Sáng muộn", "a slow morning") on a day that starts early is written again.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import { alignStableIds, choicesOfDay, isKept, minuteOfDate } from '@cp/planner';

import { scheduleChoices } from './day';
import { essentialsOf } from './essentials';
import type { RedraftPlanInput } from './redraft-input';
import type { SkeletonDay } from './skeleton';

/** Whether the organiser asked for a slower or lighter day (chips, or her note: `plannedRedraft`). */
export function asksSlower(input: Pick<RedraftPlanInput, 'reasons'>): boolean {
  return input.reasons.some((reason) => reason === 'slower' || reason === 'lighter_day');
}

const activitiesOf = (day: DraftDay) => day.items.filter((item) => item.kind === 'activity').length;

/** The most stops and activities a slower redraft of `base` may hold. */
export function slowerLimits(base: DraftDay): { stops: number; activities: number } {
  return { stops: base.items.length, activities: Math.max(1, activitiesOf(base) - 1) };
}

/** `plan` with its day `input.dayNo` within `slowerLimits(base)` (see the file header). */
export function slowerDay(
  input: RedraftPlanInput,
  skeleton: SkeletonDay,
  base: DraftDay,
  plan: Itinerary,
): Itinerary {
  const day = plan.days.find((d) => d.day_no === input.dayNo);
  if (day === undefined) return plan;
  const limits = slowerLimits(base);
  const essential = new Set(essentialsOf(input).map((poi) => poi.id));
  const was = new Set(base.items.map((item) => item.poi_id));
  const start = (iso: string) => Date.parse(iso);
  const givers = day.items
    .filter(
      (item) =>
        item.kind === 'activity' &&
        !isKept(item) &&
        item.must_do_id === null &&
        !essential.has(item.poi_id ?? ''),
    )
    .sort(
      (a, b) =>
        Number(was.has(b.poi_id)) - Number(was.has(a.poi_id)) ||
        start(b.starts_at) - start(a.starts_at),
    );
  const gone = new Set<string>();
  let stops = day.items.length;
  let activities = activitiesOf(day);
  for (const item of givers) {
    if (stops <= limits.stops && activities <= limits.activities) break;
    gone.add(item.stable_id);
    stops -= 1;
    activities -= 1;
  }
  if (gone.size === 0) return plan;
  const kept = day.items.filter((item) => !gone.has(item.stable_id));
  const timed = scheduleChoices(
    input,
    {
      ...skeleton,
      mustDoIds: kept.flatMap((item) => (item.must_do_id === null ? [] : [item.must_do_id])),
    },
    choicesOfDay({ items: kept }),
    `slower-${input.dayNo}`,
  );
  const next = alignStableIds(base, { ...timed, theme: day.theme });
  return { ...plan, days: plan.days.map((d) => (d.day_no === input.dayNo ? next : d)) };
}

const LATE_MORNING =
  /\b(sang muon|ngu nuong|day muon|late (start|morning)|slow morning|lie[ -]in|sleep[ -]in|lazy morning)\b/u;
/** A day that starts before this has no late morning. */
const LATE_FROM_MIN = 10 * 60;

const unmarked = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase();

/** Whether the day's title promises a late morning its first stop does not keep. */
export function lateTitleEarlyDay(input: Pick<RedraftPlanInput, 'frame'>, day: DraftDay): boolean {
  const first = day.items[0];
  if (first === undefined || !LATE_MORNING.test(unmarked(day.theme))) return false;
  return minuteOfDate(new Date(first.starts_at), day.date, input.frame.tz) < LATE_FROM_MIN;
}
