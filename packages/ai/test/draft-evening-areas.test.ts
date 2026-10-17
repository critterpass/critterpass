/**
 * Evenings end the day where it is: a stop for after dinner in the day's areas (or the one beside
 * them) comes before one across town, even one itinerary pages agree on.
 */
import type { Itinerary } from '@cp/domain';
import { straightLineMatrix, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { areaStep, hopCap } from '../src/prompts/draft/areas';
import type { DraftPlanInput } from '../src/prompts/draft/context';
import { fillEvenings } from '../src/prompts/draft/evenings';
import type { SkeletonDay } from '../src/prompts/draft/skeleton';

type Day = Itinerary['days'][number];

const outlineOf = (day: Day): SkeletonDay => ({
  dayNo: day.day_no,
  date: day.date,
  theme: day.theme,
  area: 'the centre',
  mustDoIds: [],
  poiIds: day.items.flatMap((item) =>
    item.kind === 'activity' && item.poi_id !== null ? [item.poi_id] : [],
  ),
  mealIds: [],
  spareIds: [],
});

/** A bar for after dark at `poi`'s place, `metres` north of it, open all day every day. */
function barAt(poi: DraftPoi, id: string, metres: number, agreed: boolean): DraftPoi {
  return {
    ...poi,
    id,
    name: `${id} bar`,
    category: 'nightlife',
    tags: ['nightlife'],
    lat: poi.lat + metres / 111_000,
    hours: null,
    hoursGuessed: false,
    bestTimes: ['after_dark'],
    mustSee: false,
    essential: agreed,
    essentialRank: agreed ? 1 : null,
  };
}

/** `input` with `bars` on its lists, open every day, for a crew that likes the night. */
function withBars(input: DraftPlanInput, bars: readonly DraftPoi[]): DraftPlanInput {
  const pois = new Map([...input.pois, ...bars.map((bar) => [bar.id, bar] as const)]);
  const days = input.frame.dates.map((_, index) => index + 1);
  return {
    ...input,
    pois,
    tastes: { ...input.tastes, nightlife: 1 },
    travel: straightLineMatrix(pois),
    pools: {
      ...input.pools,
      activities: [...input.pools.activities, ...bars],
      openDays: new Map([...input.pools.openDays, ...bars.map((bar) => [bar.id, days] as const)]),
    },
  };
}

/** The bar across town: due north of `poi`, in an area of its own a ride away but within reach. */
function barAcrossTown(input: DraftPlanInput, poi: DraftPoi): DraftPoi | undefined {
  const cap = hopCap(input);
  for (let metres = 500; metres <= 30_000; metres += 250) {
    const bar = { ...barAt(poi, 'far', metres, true), area: 'Across the river' };
    const ride = straightLineMatrix(
      new Map([
        [poi.id, poi],
        [bar.id, bar],
      ]),
    )(poi.id, bar.id);
    if (ride != null && ride > cap / 3 && ride <= cap) return bar;
  }
  return undefined;
}

describe('evening areas', { timeout: 60_000 }, () => {
  it('keeps the evening in the day’s areas over one across town that pages agree on', () => {
    let checked = 0;
    for (const crew of CREWS) {
      const plain = planInput(crew);
      const base = baselineItinerary(plain);
      // A day between the first and the last that ends with its dinner.
      const day = base.days.find(
        (d, index) => index > 0 && index < base.days.length - 1 && d.items.at(-1)?.kind === 'meal',
      );
      const last = plain.pois.get(day?.items.at(-1)?.poi_id ?? '');
      if (day === undefined || last === undefined) continue;
      const far = barAcrossTown(plain, last);
      if (far === undefined) continue;
      const input = withBars(plain, [barAt(last, 'near', 150, false), far]);
      const here = day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));
      if (areaStep(input, 'far', here) !== 2 || areaStep(input, 'near', here) === 2) continue;
      const after = fillEvenings(input, base.days.map(outlineOf), base).itinerary;
      const evening = after.days
        .find((d) => d.day_no === day.day_no)
        ?.items.flatMap((item) =>
          item.poi_id === 'near' || item.poi_id === 'far' ? [item.poi_id] : [],
        );
      if (evening === undefined || evening.length === 0) continue;
      checked += 1;
      expect(evening).toEqual(['near']);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
