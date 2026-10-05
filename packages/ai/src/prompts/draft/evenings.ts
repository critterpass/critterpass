/**
 * Evenings. A crew that likes the night (a taste for nightlife, or mostly night owls) gets a stop
 * after dinner on each day but its last, where the destination has one for the evening and it is
 * near where the day ends: the night market, a square that fills after dark, a bar, a café with
 * music. An essential first, then a must-see, then the nearest. One evening per place.
 */
import type { Itinerary } from '@cp/domain';
import { DINNER, minuteOfDate, placeTime, withinReach, type DraftPoi } from '@cp/planner';

import { homeOf, hopCap, spanOf } from './areas';

import { addOne, nearFirst, type Attempt } from './complete-days';
import type { DraftPlanInput } from './context';
import type { SkeletonDay } from './skeleton';

/** A stop that starts from here on is the day's evening. */
const EVENING_FROM_MIN = 19 * 60;
const TRIED = 6;

/** Whether the crew's tastes ask for something after dinner. */
export function wantsEvenings(input: Pick<DraftPlanInput, 'tastes' | 'frame'>): boolean {
  if ((input.tastes['nightlife'] ?? 0) > 0) return true;
  const { members, chronotypes } = input.frame;
  const owls = members.filter((uid) => chronotypes[uid] === 'night_owl').length;
  return members.length > 0 && owls * 2 > members.length;
}

/** Whether `poi` is a place for after dinner. */
export function isForEvening(poi: DraftPoi): boolean {
  const time = placeTime(poi);
  return time === 'evening' || time === 'after_dark' || poi.category === 'nightlife';
}

export function fillEvenings(
  input: DraftPlanInput,
  outlines: readonly SkeletonDay[],
  start: Itinerary,
): Attempt {
  if (!wantsEvenings(input)) return { itinerary: start, added: 0 };
  let itinerary = start;
  let added = 0;
  const lastDay = input.frame.dates.length;
  for (const outline of outlines) {
    const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
    if (day === undefined || day.items.length === 0 || outline.dayNo === lastDay) continue;
    const at = (iso: string) => minuteOfDate(new Date(iso), day.date, input.frame.tz);
    const dined = day.items.some(
      (item) => item.kind === 'meal' && at(item.starts_at) >= DINNER.startMin - 30,
    );
    const out = day.items.some(
      (item) => item.kind !== 'meal' && at(item.starts_at) >= EVENING_FROM_MIN,
    );
    if (!dined || out) continue;
    const used = new Set(itinerary.days.flatMap((d) => d.items.map((item) => item.poi_id)));
    const last = day.items[day.items.length - 1]?.poi_id;
    // Near where the day ends, or near the stay: never a long ride, nor an hours-long show.
    const near = [last, homeOf(input)].filter((id): id is string => id != null);
    const offered = [...new Set([...input.pools.activities, ...input.pools.sights])].filter(
      (poi) =>
        isForEvening(poi) &&
        spanOf(input, poi) === null &&
        !used.has(poi.id) &&
        withinReach(poi.id, near, input.travel, hopCap(input)) &&
        (input.pools.openDays.get(poi.id) ?? []).includes(outline.dayNo),
    );
    const worth = (poi: DraftPoi) => (poi.essential === true ? 0 : poi.mustSee ? 1 : 2);
    const candidates = nearFirst(input, offered, last == null ? [] : [last])
      .map((poi, rank) => ({ poi, rank }))
      .sort((a, b) => worth(a.poi) - worth(b.poi) || a.rank - b.rank)
      .slice(0, TRIED)
      .map((entry) => entry.poi);
    const next = addOne(
      input,
      outline,
      itinerary,
      candidates,
      // As clean as it was, and the new stop really is the evening's.
      (before, after, made) =>
        after.hard <= before.hard &&
        after.meals <= before.meals &&
        made.items.some(
          (item) => item.kind !== 'meal' && at(item.starts_at) >= EVENING_FROM_MIN - 30,
        ),
      `evening-${outline.dayNo}`,
      undefined,
      undefined,
      day.items.length,
      undefined,
      'night',
    );
    if (next === null) continue;
    itinerary = next;
    added += 1;
  }
  return { itinerary, added };
}
