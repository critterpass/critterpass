/**
 * Stops the organiser already placed on a day (`DraftPlanInput.held`), as the drafting stages use
 * them: as choices that keep their times, as lines the guide is told, and as the meals a day no
 * longer needs a place for.
 */
import {
  choicesOfDay,
  dayWindow,
  isTheirs,
  mealAt,
  mealsInWindow,
  minuteOfDate,
  pinIdOf,
  placeIdOf,
  straightLineMatrix,
  type DayChoice,
  type DraftPoi,
} from '@cp/planner';

import { clockText, type DraftPlanInput, type HeldStop } from './context';

/** The held stops of day `dayNo` as choices that keep their times, in time order. */
export function heldChoices(input: Pick<DraftPlanInput, 'held'>, dayNo: number): DayChoice[] {
  const items = (input.held ?? [])
    .filter((stop) => stop.dayNo === dayNo)
    .map((stop) => stop.item)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  // Hers whatever the row says of why: a held stop always keeps its times.
  return choicesOfDay({
    items: items.map((item) => (isTheirs(item) ? item : { ...item, locked_reason: 'user' })),
  });
}

/** The meals day `dayNo` still needs a place for: those its window runs through, less the held ones. */
export function mealsNeeded(
  input: Pick<DraftPlanInput, 'held' | 'frame'>,
  dayNo: number,
): ('lunch' | 'dinner')[] {
  const date = input.frame.dates[dayNo - 1] ?? '';
  const own = new Set(
    (input.held ?? [])
      .filter((stop) => stop.dayNo === dayNo && stop.item.kind === 'meal')
      .map((stop) => mealAt(minuteOfDate(new Date(stop.item.starts_at), date, input.frame.tz))),
  );
  return mealsInWindow(dayWindow(input.frame, dayNo - 1)).filter((slot) => !own.has(slot));
}

/** One line per held stop of the day, for the guide: when, where, and what it is. */
export function heldLines(
  input: Pick<DraftPlanInput, 'held' | 'pois' | 'frame'>,
  dayNo: number,
  date: string,
): string[] {
  return (input.held ?? [])
    .filter((stop) => stop.dayNo === dayNo)
    .sort((a, b) => Date.parse(a.item.starts_at) - Date.parse(b.item.starts_at))
    .map(({ item }) => {
      const at = (iso: string) => clockText(minuteOfDate(new Date(iso), date, input.frame.tz));
      const poi = input.pois.get(placeIdOf(item) ?? '');
      const what =
        item.kind === 'meal'
          ? `a meal (it is the day's ${mealAt(minuteOfDate(new Date(item.starts_at), date, input.frame.tz)) ?? 'meal'}: plan no other)`
          : (poi?.category.replaceAll('_', ' ') ?? 'a stop');
      return `- ${at(item.starts_at)}–${at(item.ends_at)} | ${poi?.name ?? item.note ?? 'a stop of their own'} | ${what}`;
    });
}

/**
 * The input with the organiser's own stops on it. A stop on a dropped pin has no place of ours:
 * its pin becomes a place of this draft alone (a point and a name, under the stop's pin id), so
 * rides to and from it are known and it is never an unknown place. Pins are offered to nobody.
 */
export function withHeldStops(input: DraftPlanInput, held: readonly HeldStop[]): DraftPlanInput {
  const pins = held.flatMap((stop): DraftPoi[] => {
    if (stop.pin === undefined || stop.item.poi_id !== null) return [];
    const minutes = (Date.parse(stop.item.ends_at) - Date.parse(stop.item.starts_at)) / 60_000;
    return [
      {
        id: pinIdOf(stop.item.stable_id),
        name: stop.pin.name,
        category: stop.item.kind === 'meal' ? 'food' : 'other',
        lat: stop.pin.lat,
        lng: stop.pin.lng,
        tz: stop.item.tz,
        hours: null,
        priceLevel: null,
        tags: [],
        durationMin: Math.max(15, Math.round(minutes)),
        editorial: false,
        mustSee: false,
      },
    ];
  });
  if (pins.length === 0) return { ...input, held };
  const pois = new Map([...input.pois, ...pins.map((pin): [string, DraftPoi] => [pin.id, pin])]);
  return { ...input, held, pois, travel: straightLineMatrix(pois, input.routed) };
}
