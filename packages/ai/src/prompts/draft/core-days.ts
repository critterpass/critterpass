/**
 * Which day each core must-see goes on when the guide's outline left it out (./must-sees.ts).
 */
import { areaStep, areasHeld, dayOutOf, rideFrom } from './areas';
import type { DraftPlanInput } from './context';
import { coreMustSees } from './must-sees';
import { anchorsOf, fits, type OutlineDay } from './skeleton-days';

/**
 * Gives each core must-see the guide left out a day it still fits on, among the days it is open:
 * one in the day's own areas, else a neighbouring area, then the nearest, then the lightest. Only
 * an essential may open a second area farther out, on a day still in one area (a morning out,
 * then back to town). A day out takes only its outing and what is in its area. Any other
 * must-see that would take a day across town is left out: a day zigzagging for a sight is worse
 * than a day without it. The guide's own picks keep their seats ahead of what code adds: its
 * must-sees first, then its other places (the evening viewpoint it chose for the day), then the
 * must-sees added here.
 */
export function placeCore(
  input: DraftPlanInput,
  days: readonly OutlineDay[],
  taken: Set<string>,
): void {
  const core = coreMustSees(input);
  const load = (day: OutlineDay) => day.mustDoIds.length + day.poiIds.length;
  const added = new Set<string>();
  for (const id of core) {
    if (taken.has(id)) continue;
    const open = input.pools.openDays.get(id) ?? [];
    const essential = input.pois.get(id)?.essential === true;
    const day = days
      .filter((d) => open.includes(d.dayNo))
      .map((d) => {
        const anchors = anchorsOf(input, d);
        const out = [...dayOutOf(input, d.dayNo)];
        const step = areaStep(input, id, anchors);
        const ride = rideFrom(input, id, anchors);
        // A day out holds its outing and what is in its area, never a sight from town.
        const allowed =
          out.length > 0
            ? out.includes(id) || areaStep(input, id, [...anchors, ...out]) === 0
            : step < 2 || (essential && areasHeld(input, anchors).size < 2);
        return { d, step, ride, allowed };
      })
      // A day that is full would only trim it off again, or trim off one of the guide's picks.
      .filter((entry) => entry.allowed && fits(input, entry.d, [...entry.d.poiIds, id]))
      .sort(
        (a, b) =>
          a.step - b.step || a.ride - b.ride || load(a.d) - load(b.d) || a.d.dayNo - b.d.dayNo,
      )[0];
    if (day === undefined) continue;
    day.d.poiIds.push(id);
    taken.add(id);
    added.add(id);
  }
  const first = new Set(core);
  const seat = (id: string) => (added.has(id) ? 2 : first.has(id) ? 0 : 1);
  for (const day of days) day.poiIds.sort((a, b) => seat(a) - seat(b));
}
