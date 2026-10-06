/** Which days of a frame a place can go on (./candidate-pools offers it on those only). */
import { dayWindow } from './day-window';
import { ceilGrid } from './day-minutes';
import { foodRole } from './food-role';
import { mealSlots, mealsInWindow } from './meal-slots';
import { spansOn } from './sequence';
import { placeWindows } from './time-of-day';
import type { DraftPoi, TripFrame } from './types';
import { closedOn } from './validate-itinerary';

/**
 * A place can go on a day when a whole visit fits inside both its hours and the day's window;
 * with `timed`, also at the time of day the place is for, or at a meal it serves.
 */
export function openOnDay(poi: DraftPoi, frame: TripFrame, index: number, timed: boolean): boolean {
  const date = frame.dates[index] as string;
  if (closedOn(frame, poi, date) === 'poi') return false;
  const window = dayWindow(frame, index);
  const visit = ceilGrid(poi.durationMin);
  const owns = timed ? placeWindows(poi, date) : [];
  if (timed && foodRole(poi) === 'meal') {
    const served = mealSlots(poi, date);
    if (!mealsInWindow(window).some((slot) => served.includes(slot))) return false;
  }
  // Any of its times of day will do (a beach early or late).
  return (owns.length === 0 ? [null] : owns).some((own) =>
    spansOn(poi.hours, date).some((span) => {
      const start = Math.max(window.startMin, ceilGrid(span.start), own?.fromMin ?? 0);
      return start + visit <= Math.min(window.endMin, span.end) && start <= (own?.toMin ?? start);
    }),
  );
}
