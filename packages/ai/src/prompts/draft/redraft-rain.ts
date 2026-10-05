/**
 * A redraft asked for because of rain. The organiser says it in her note ("trời hay mưa, cho mình
 * chỗ trong nhà", "it will rain, something indoors"); the note is a preference, read here only for
 * that one fact. The guide is told which stops are in the open air and to swap them for places
 * under a roof; a stop it leaves outdoors while an indoor place it was offered fits is swapped by
 * the planner; and one that stays outdoors because nothing indoors is near says so on its note.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import { choicesOfDay, isKept, withNoteLine, type DraftPoi } from '@cp/planner';

import { scheduleChoices } from './day';
import { plannerLines } from './final-notes';
import type { RedraftPlanInput } from './redraft-input';
import type { SkeletonDay } from './skeleton';
import { validate } from './validate';

const OUTDOOR: ReadonlySet<string> = new Set(['nature', 'beach']);
const OUTDOOR_TAGS: ReadonlySet<string> = new Set(['hiking', 'viewpoint', 'beach']);
/** "mưa" keeps its accent: without it the word is "to buy". */
const RAIN =
  /\b(rain(y|ing|s)?|storm(y|s)?|wet weather|indoors?|under a roof)\b|mưa|trong nhà|bão/iu;

/** Whether the organiser's note asks for a day out of the rain. */
export function wantsIndoors(input: Pick<RedraftPlanInput, 'note'>): boolean {
  return input.note !== null && RAIN.test(input.note.normalize('NFC'));
}

/** Whether a stop at `poi` is spent in the open air. */
export function isOutdoors(poi: DraftPoi): boolean {
  return OUTDOOR.has(poi.category) || poi.tags.some((tag) => OUTDOOR_TAGS.has(tag));
}

/** The day's stops the guide could have taken indoors: outdoors, and not the crew's own. */
export function leftOutdoors(input: RedraftPlanInput, day: DraftDay): DraftPoi[] {
  if (!wantsIndoors(input)) return [];
  return day.items.flatMap((item) => {
    const poi = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
    return poi === undefined || isKept(item) || !isOutdoors(poi) ? [] : [poi];
  });
}

/** What the guide is told when the day is redrafted for rain. */
export const RAIN_TARGET =
  'Rain means no stop in the open air: swap every stop marked outdoors (unless it is marked KEEP) for a place under a roof from the lists (a museum, a café, a covered market, a temple). If the lists hold nothing indoors near the day, keep the stop and say plainly in the summary that nothing indoors is near.';

/**
 * Swaps each stop left outdoors for the first indoor place offered that leaves the day as clean;
 * a stop nothing could replace says on its note that nothing indoors is near.
 */
export function indoorsInstead(
  input: RedraftPlanInput,
  skeleton: SkeletonDay,
  start: Itinerary,
): Itinerary {
  let itinerary = start;
  const faults = (plan: Itinerary) =>
    validate(input, plan).violations.filter((v) => v.dayNo === input.dayNo).length;
  for (const outdoor of leftOutdoors(input, dayOf(start, input.dayNo))) {
    const day = dayOf(itinerary, input.dayNo);
    const used = new Set(itinerary.days.flatMap((d) => d.items.map((item) => item.poi_id)));
    const indoor = skeleton.poiIds
      .map((id) => input.pois.get(id))
      .filter((poi): poi is DraftPoi => poi !== undefined && !used.has(poi.id) && !isOutdoors(poi));
    const before = faults(itinerary);
    let swapped = false;
    for (const poi of indoor) {
      const choices = choicesOfDay(day).map((choice) =>
        choice.poiId === outdoor.id
          ? { ...choice, poiId: poi.id, note: poi.whyGo ?? null }
          : choice,
      );
      const next = scheduleChoices(input, skeleton, choices, `indoors-${outdoor.id}-${poi.id}`);
      if (next.items.length !== choices.length) continue;
      const candidate = withDay(itinerary, { ...next, theme: day.theme });
      if (faults(candidate) > before) continue;
      itinerary = candidate;
      swapped = true;
      break;
    }
    if (swapped) continue;
    const line = plannerLines(input.locale).outdoors;
    itinerary = withDay(itinerary, {
      ...day,
      items: day.items.map((item) =>
        item.poi_id === outdoor.id ? { ...item, note: withNoteLine(item.note, line) } : item,
      ),
    });
  }
  return itinerary;
}

function dayOf(itinerary: Itinerary, dayNo: number): DraftDay {
  return itinerary.days.find((d) => d.day_no === dayNo) as DraftDay;
}

function withDay(itinerary: Itinerary, day: DraftDay): Itinerary {
  return { ...itinerary, days: itinerary.days.map((d) => (d.day_no === day.day_no ? day : d)) };
}
