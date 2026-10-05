/** The code-built draft the redraft cases start from. */
import type { Itinerary } from '@cp/domain';
import { dayWindow, scheduleDay, stopKind, visitOrder, type DayChoice } from '@cp/planner';

import type { DraftPlanInput } from '../../src/prompts/draft/context';
import { heldChoices } from '../../src/prompts/draft/held';

/**
 * A plain draft built by code, the base a redraft case starts from: must-dos on the lightest day
 * they are open, then the pool's activities and a lunch and dinner place, scheduled by the planner.
 */
export function baselineItinerary(input: DraftPlanInput): Itinerary {
  const { frame, pools } = input;
  const used = new Set<string>();
  const byDay: DayChoice[][] = frame.dates.map(() => []);
  for (const slot of pools.mustDos) {
    const day = [...slot.openDays].sort(
      (a, b) => (byDay[a - 1]?.length ?? 0) - (byDay[b - 1]?.length ?? 0),
    )[0];
    if (day === undefined) continue;
    const poi = input.pois.get(slot.poiId);
    byDay[day - 1]?.push({
      poiId: slot.poiId,
      kind: stopKind(poi),
      mustDoId: slot.mustDoId,
      note: null,
    });
    used.add(slot.poiId);
  }
  const days = frame.dates.map((date, index) => {
    const own = heldChoices(input, index + 1);
    const choices = [...own, ...(byDay[index] ?? [])];
    const open = (id: string) =>
      (pools.openDays.get(id) ?? []).includes(index + 1) && !used.has(id);
    const window = dayWindow(frame, index);
    const room = Math.max(0, Math.floor((window.endMin - window.startMin) / 150) - choices.length);
    for (const poi of pools.activities.filter((p) => open(p.id)).slice(0, Math.min(2, room))) {
      choices.push({ poiId: poi.id, kind: 'activity', mustDoId: null, note: null });
      used.add(poi.id);
    }
    const meal = pools.meals.find((p) => open(p.id));
    const fed = own.some((choice) => choice.kind === 'meal');
    if (meal !== undefined && !fed && window.endMin - window.startMin >= 240) {
      choices.splice(Math.min(1, choices.length), 0, {
        poiId: meal.id,
        kind: 'meal',
        mustDoId: null,
        note: null,
      });
      used.add(meal.id);
    }
    // In the order the planner would visit them (an after-dark must-do last, not first).
    const order = visitOrder({
      date,
      choices,
      pois: input.pois,
      window,
      travel: input.travel,
      tz: frame.tz,
    });
    return scheduleDay({
      dayNo: index + 1,
      date,
      theme: `Day in ${input.destination.split(',')[0] ?? 'town'}`,
      choices: order.map((at) => choices[at] as DayChoice),
      pois: input.pois,
      window,
      travel: input.travel,
      bands: input.bands,
      currency: frame.currency,
      tz: frame.tz,
      idFor: (choice, i) => input.idFor(`base:${index + 1}:${i}:${choice.poiId}`),
    });
  });
  return { currency: frame.currency, days };
}
