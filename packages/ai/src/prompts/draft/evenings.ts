/**
 * Evenings. A crew that likes the night (a taste for nightlife, or mostly night owls) gets a stop
 * after dinner on each day but its last, where the destination has one for the evening and it is
 * near where the day ends: the night market, a square that fills after dark, a bar, a café with
 * music. Every other crew gets the evenings a first visit is known for, the essentials and
 * must-sees that happen after dark (the fado house, the water puppets, the fire show, the night
 * market), and a crew that wants quiet evenings never a bar. One in the day's areas first; then
 * an essential, then a must-see, then the nearest. One evening per place.
 */
import type { Itinerary } from '@cp/domain';
import { DINNER, leavesOn, minuteOfDate, placeTime, withinReach, type DraftPoi } from '@cp/planner';

import { areaStep, homeOf, hopCap, spanOf } from './areas';

import { addOne, nearFirst, type Attempt } from './complete-days';
import type { DraftPlanInput } from './context';
import { misplacedOpeners } from './openers';
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

const isNightlife = (poi: DraftPoi) =>
  poi.category === 'nightlife' || poi.tags.includes('nightlife');

/**
 * What an evening may hold for this crew: anything for the night for a crew that likes it, else
 * what people come for (and never a bar for a crew that wants quiet evenings).
 */
export function suitsEvening(
  input: Pick<DraftPlanInput, 'tastes' | 'frame'>,
): (poi: DraftPoi) => boolean {
  const night = wantsEvenings(input);
  const quiet = (input.tastes['quiet_evenings'] ?? 0) > 0;
  return (poi) =>
    night || ((poi.essential === true || poi.mustSee) && !(quiet && isNightlife(poi)));
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
  const suits = suitsEvening(input);
  let itinerary = start;
  let added = 0;
  for (const outline of outlines) {
    const day = itinerary.days.find((d) => d.day_no === outline.dayNo);
    if (day === undefined || day.items.length === 0 || leavesOn(input.frame, outline.dayNo - 1)) {
      continue;
    }
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
        suits(poi) &&
        spanOf(input, poi) === null &&
        !used.has(poi.id) &&
        withinReach(poi.id, near, input.travel, hopCap(input)) &&
        (input.pools.openDays.get(poi.id) ?? []).includes(outline.dayNo),
    );
    const worth = (poi: DraftPoi) => (poi.essential === true ? 0 : poi.mustSee ? 1 : 2);
    // In the day's areas (or the one beside them) before one across town, then by worth.
    const here = day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));
    const away = (poi: DraftPoi) => (areaStep(input, poi.id, here) < 2 ? 0 : 1);
    const candidates = nearFirst(input, offered, last == null ? [] : [last])
      .map((poi, rank) => ({ poi, rank, away: away(poi) }))
      .sort((a, b) => a.away - b.away || worth(a.poi) - worth(b.poi) || a.rank - b.rank)
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
        misplacedOpeners(input, made).length === 0 &&
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
