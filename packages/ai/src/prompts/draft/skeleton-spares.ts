/**
 * The spares of each day of the outline: unused activities set aside for when a planned one does
 * not fit, each on the day it sits with.
 */
import { withinReach } from '@cp/planner';

import { areaStep, hopCap, rideFrom } from './areas';
import type { DraftPlanInput } from './context';
import { anchorsOf, type OutlineDay } from './skeleton-days';

const SPARES_PER_DAY = 4;

/**
 * Unused activities near each day, for when a planned one does not fit: each goes to the day whose
 * areas it is in (else the nearest day it neighbours), never to one it takes across town.
 */
export function assignSpares(
  input: DraftPlanInput,
  days: readonly OutlineDay[],
  taken: ReadonlySet<string>,
): void {
  const cap = hopCap(input);
  for (const poi of input.pools.activities) {
    if (taken.has(poi.id)) continue;
    const open = input.pools.openDays.get(poi.id) ?? [];
    const day = days
      .filter(
        (d) =>
          open.includes(d.dayNo) &&
          d.spareIds.length < SPARES_PER_DAY &&
          withinReach(poi.id, anchorsOf(input, d), input.travel, cap),
      )
      .map((d) => {
        const anchors = anchorsOf(input, d);
        return {
          d,
          step: areaStep(input, poi.id, anchors),
          ride: rideFrom(input, poi.id, anchors),
        };
      })
      .filter((entry) => entry.step < 2)
      .sort(
        (a, b) => a.step - b.step || a.ride - b.ride || a.d.spareIds.length - b.d.spareIds.length,
      )[0];
    day?.d.spareIds.push(poi.id);
  }
}
