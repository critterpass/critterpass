/**
 * An essential placed late never takes the seat of one the researchers rank before it: a long
 * visit beside the city's first sight is not a visit that takes that sight in. One ranked after it
 * still gives way, the way a bridge inside an old town is seen on the old town's visit.
 */
import type { Itinerary } from '@cp/domain';
import type { DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import type { DraftPlanInput } from '../src/prompts/draft/context';
import { placeEssentials } from '../src/prompts/draft/essentials';
import type { SkeletonDay } from '../src/prompts/draft/skeleton';

const crew = CREWS.find((c) => c.id === 'lisbon-1');
if (crew === undefined) throw new Error('no lisbon-1 crew');
const plain = planInput(crew);
const base = baselineItinerary(plain);
const byName = (name: string) => {
  const poi = [...plain.pois.values()].find((p) => p.name === name);
  if (poi === undefined) throw new Error(`no ${name}`);
  return poi;
};
const castle = byName('São Jorge Castle');
const tram = byName('Tram 28 ride');
const dayNo = base.days.find((d) => d.items.some((i) => i.poi_id === castle.id))?.day_no ?? 0;

const outlines: SkeletonDay[] = base.days.map((d) => ({
  dayNo: d.day_no,
  date: d.date,
  theme: d.theme,
  area: '',
  mustDoIds: [],
  poiIds: d.items.flatMap((i) => (i.kind === 'activity' && i.poi_id !== null ? [i.poi_id] : [])),
  mealIds: [],
  spareIds: [],
}));

/** The castle and a long tram ride beside it both essential, the ride only open on its day. */
function ranked(castleRank: number, tramRank: number): DraftPlanInput {
  const first: DraftPoi = { ...castle, essential: true, essentialRank: castleRank };
  const ride: DraftPoi = { ...tram, essential: true, essentialRank: tramRank, durationMin: 200 };
  const swap = (poi: DraftPoi) => (poi.id === ride.id ? ride : poi.id === first.id ? first : poi);
  const pois = new Map(plain.pois);
  pois.set(first.id, first);
  pois.set(ride.id, ride);
  return {
    ...plain,
    pois,
    pools: {
      ...plain.pools,
      openDays: new Map([...plain.pools.openDays, [ride.id, [dayNo]]]),
      activities: plain.pools.activities.map(swap),
      sights: plain.pools.sights.map(swap),
    },
  };
}

const held = (itinerary: Itinerary) =>
  new Set(itinerary.days.flatMap((d) => d.items.map((i) => i.poi_id)));

describe('placing an essential late', () => {
  it('keeps an essential ranked before it, rather than seat it', () => {
    expect(held(base).has(castle.id)).toBe(true);
    expect(held(base).has(tram.id)).toBe(false);
    const after = held(placeEssentials(ranked(1, 2), outlines, base).itinerary);
    expect(after.has(castle.id)).toBe(true);
  });

  it('takes the seat of one ranked after it', () => {
    const after = held(placeEssentials(ranked(2, 1), outlines, base).itinerary);
    expect(after.has(tram.id)).toBe(true);
  });
});
