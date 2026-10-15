/**
 * Which day each core must-see goes on when the guide's outline left it out (./must-sees.ts).
 */
import { areaStep, areasHeld, rideFrom } from './areas';
import type { DraftPlanInput } from './context';
import { coreMustSees } from './must-sees';
import { anchorsOf, fits, type OutlineDay } from './skeleton-days';

/**
 * Gives each core must-see the guide left out a day: one it still fits on, in the day's own areas
 * (else a neighbouring area, else a second area farther out of a day that spans one: a morning
 * out, then back to town; then the nearest, then the lightest), among the days it is open. One
 * that would take every day into a third area is left out: a day zigzagging for a sight is worse
 * than a day without it. Then puts every day's core must-sees first.
 */
export function placeCore(
  input: DraftPlanInput,
  days: readonly OutlineDay[],
  taken: Set<string>,
): void {
  const core = coreMustSees(input);
  const load = (day: OutlineDay) => day.mustDoIds.length + day.poiIds.length;
  for (const id of core) {
    if (taken.has(id)) continue;
    const open = input.pools.openDays.get(id) ?? [];
    const day = days
      .filter((d) => open.includes(d.dayNo))
      .map((d) => {
        const anchors = anchorsOf(input, d);
        const step = areaStep(input, id, anchors);
        const ride = rideFrom(input, id, anchors);
        return { d, step, ride, allowed: step === 0 || areasHeld(input, anchors).size < 2 };
      })
      .filter((entry) => entry.allowed)
      .map((entry) => ({ ...entry, room: fits(input, entry.d, [...entry.d.poiIds, id]) ? 0 : 1 }))
      // A day it still fits on first: a day that is full would only trim it off again.
      .sort(
        (a, b) =>
          a.room - b.room ||
          a.step - b.step ||
          a.ride - b.ride ||
          load(a.d) - load(b.d) ||
          a.d.dayNo - b.d.dayNo,
      )[0];
    if (day === undefined) continue;
    day.d.poiIds.push(id);
    taken.add(id);
  }
  const first = new Set(core);
  for (const day of days) {
    day.poiIds.sort((a, b) => Number(first.has(b)) - Number(first.has(a)));
  }
}
