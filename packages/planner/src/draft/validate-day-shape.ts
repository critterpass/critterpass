/**
 * The validator's checks of how a day is shaped around its big stops: a day out holds its outing
 * and not stops back in town (./outings), a stop inside a long visit is part of that visit, and a
 * visit of half a day or a whole one has that time to itself (./long-visits).
 */
import { landsOn, leavesOn } from './day-window';
import { insideFaults, longVisitFaults } from './long-visits';
import { farAfterDayOut, offTheOuting } from './outings';
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
  const home = input.homeId ?? null;
  const rideOf = (poi: DraftPoi) => (home === null ? 0 : (input.travel(home, poi.id) ?? 0));
  const outings = input.outings ?? [];
  const together = (a: string, b: string) =>
    outings.some((outing) => outing.poiIds.includes(a) && outing.poiIds.includes(b));
  const at = (code: DraftViolationCode, dayNo: number, stop: TimedStop): DraftViolation => ({
    code,
    dayNo,
    stableId: stop.item.stable_id,
    poiId: stop.poi.id,
  });
  return days.flatMap((day) => {
    const index = dateIndex.get(day.date) ?? day.dayNo - 1;
    const edge = landsOn(input.frame, index) || leavesOn(input.frame, index);
    return [
      ...offTheOuting(day, outings, input.travel, input.hopCapMin, home).map((stop) =>
        at('OFF_THE_OUTING', day.dayNo, stop),
      ),
      ...farAfterDayOut(day, outings, input.travel, home, input.hopCapMin).map((stop) =>
        at('FAR_AFTER_DAY_OUT', day.dayNo, stop),
      ),
      ...insideFaults(day, rideOf).map((stop) => at('INSIDE_ANOTHER_STOP', day.dayNo, stop)),
      ...longVisitFaults(day, edge, rideOf, together).map((fault) =>
        at('CROWDED_LONG_VISIT', fault.dayNo, fault.stop),
      ),
    ];
  });
}
