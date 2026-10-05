/**
 * Which day each core must-see goes on when the guide's outline left it out (./must-sees.ts).
 */
import { withinReach } from '@cp/planner';

import { hopCap } from './areas';
import type { DraftPlanInput } from './context';
import { coreMustSees } from './must-sees';
import { anchorsOf, type OutlineDay } from './skeleton-days';

/**
 * Gives each core must-see the guide left out a day: the one whose stops it sits nearest (then
 * the lightest), among the days it is open. Then puts every day's core must-sees first.
 */
export function placeCore(
  input: DraftPlanInput,
  days: readonly OutlineDay[],
  taken: Set<string>,
): void {
  const core = coreMustSees(input);
  const cap = hopCap(input);
  const load = (day: OutlineDay) => day.mustDoIds.length + day.poiIds.length;
  for (const id of core) {
    if (taken.has(id)) continue;
    const open = input.pools.openDays.get(id) ?? [];
    const ring = (day: OutlineDay) => {
      const anchors = anchorsOf(input, day);
      if (anchors.length === 0) return 1;
      return withinReach(id, anchors, input.travel, Math.round(cap / 2))
        ? 0
        : withinReach(id, anchors, input.travel, cap)
          ? 1
          : 2;
    };
    const day = days
      .filter((d) => open.includes(d.dayNo))
      .map((d) => ({ d, ring: ring(d) }))
      .sort((a, b) => a.ring - b.ring || load(a.d) - load(b.d) || a.d.dayNo - b.d.dayNo)[0];
    if (day === undefined) continue;
    day.d.poiIds.push(id);
    taken.add(id);
  }
  const first = new Set(core);
  for (const day of days) {
    day.poiIds.sort((a, b) => Number(first.has(b)) - Number(first.has(a)));
  }
}
