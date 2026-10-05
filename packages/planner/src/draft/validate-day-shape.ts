/**
 * The validator's checks of how a day is shaped around its big stops: a day out holds its outing
 * and not stops back in town (./outings), a stop inside a long visit is part of that visit, and a
 * visit of half a day or a whole one has that time to itself (./long-visits).
 */
import { insideFaults, longVisitFaults } from './long-visits';
import { offTheOuting } from './outings';
import type { DraftPoi } from './types';
import type { TimedDay, TimedStop } from './validate-day-sense';
import type {
  DraftViolation,
  DraftViolationCode,
  ValidateItineraryInput,
} from './validate-itinerary';

export function dayShapeViolations(
  input: ValidateItineraryInput,
  days: readonly TimedDay[],
): DraftViolation[] {
  const dateIndex = new Map(input.frame.dates.map((date, index) => [date, index]));
  const lastIndex = input.frame.dates.length - 1;
  const home = input.homeId ?? null;
  const rideOf = (poi: DraftPoi) => (home === null ? 0 : (input.travel(home, poi.id) ?? 0));
  const at = (code: DraftViolationCode, dayNo: number, stop: TimedStop): DraftViolation => ({
    code,
    dayNo,
    stableId: stop.item.stable_id,
    poiId: stop.poi.id,
  });
  return days.flatMap((day) => {
    const index = dateIndex.get(day.date) ?? day.dayNo - 1;
    const edge = index === 0 || index === lastIndex;
    return [
      ...offTheOuting(day, input.outings ?? [], input.travel, input.hopCapMin).map((stop) =>
        at('OFF_THE_OUTING', day.dayNo, stop),
      ),
      ...insideFaults(day, rideOf).map((stop) => at('INSIDE_ANOTHER_STOP', day.dayNo, stop)),
      ...longVisitFaults(day, edge, rideOf).map((fault) =>
        at('CROWDED_LONG_VISIT', fault.dayNo, fault.stop),
      ),
    ];
  });
}
