/**
 * The day a redraft case starts from, when the case names it: the stops of a day as staging held
 * it, by place name, timed by the planner. The same places come off the other days of the base,
 * so the trip holds each place once.
 */
import type { Itinerary } from '@cp/domain';
import { foodRole, type DayChoice } from '@cp/planner';

import { scheduleChoices } from '../../src/prompts/draft/day';
import type { DraftPlanInput } from '../../src/prompts/draft/context';

export function withBaseDay(
  input: DraftPlanInput,
  base: Itinerary,
  dayNo: number,
  names: readonly string[],
): Itinerary {
  const day = base.days.find((d) => d.day_no === dayNo);
  if (day === undefined) throw new Error(`no day ${dayNo}`);
  const choices = names.map((name): DayChoice => {
    const poi = [...input.pois.values()].find(
      (p) => p.name.normalize('NFC') === name.normalize('NFC'),
    );
    if (poi === undefined) throw new Error(`no place named ${name}`);
    const kind = foodRole(poi) === 'meal' ? 'meal' : 'activity';
    return { poiId: poi.id, kind, mustDoId: null, note: null };
  });
  const ids = new Set(choices.map((c) => c.poiId));
  const outline = {
    dayNo,
    date: day.date,
    theme: day.theme,
    area: 'the centre',
    mustDoIds: [],
    poiIds: choices.filter((c) => c.kind === 'activity').map((c) => c.poiId),
    mealIds: choices.filter((c) => c.kind === 'meal').map((c) => c.poiId),
    spareIds: [],
  };
  const timed = scheduleChoices(input, outline, choices, `base-day-${dayNo}`);
  return {
    ...base,
    days: base.days.map((d) =>
      d.day_no === dayNo
        ? { ...timed, theme: day.theme }
        : { ...d, items: d.items.filter((item) => !ids.has(item.poi_id ?? '')) },
    ),
  };
}
