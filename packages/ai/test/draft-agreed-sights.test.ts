/**
 * A sight itinerary pages agree on that the draft left out is seen before dinner on a day in its
 * own area, and never taken across town to a day it does not fit.
 */
import type { Itinerary } from '@cp/domain';
import { straightLineMatrix, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { afterDinner } from '../src/prompts/draft/across-town';
import { placeAgreedSights } from '../src/prompts/draft/agreed-sights';
import { areaStep } from '../src/prompts/draft/areas';
import type { DraftPlanInput } from '../src/prompts/draft/context';
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

/** A gallery six pages hold (not an essential), `metres` north of `poi`, open every day. */
function galleryBy(poi: DraftPoi, metres: number): DraftPoi {
  return {
    ...poi,
    id: 'agreed-gallery',
    name: 'Gallery on the square',
    category: 'museum',
    tags: ['museums'],
    lat: poi.lat + metres / 111_000,
    hours: null,
    hoursGuessed: false,
    durationMin: 60,
    bestTimes: ['afternoon'],
    mustSee: true,
    blogCount: 6,
    essential: false,
    essentialRank: null,
    pairsWith: [],
  };
}

function withGallery(input: DraftPlanInput, gallery: DraftPoi): DraftPlanInput {
  const pois = new Map([...input.pois, [gallery.id, gallery] as const]);
  const days = input.frame.dates.map((_, index) => index + 1);
  return {
    ...input,
    pois,
    travel: straightLineMatrix(pois),
    pools: {
      ...input.pools,
      activities: [...input.pools.activities, gallery],
      openDays: new Map([...input.pools.openDays, [gallery.id, days] as const]),
    },
  };
}

const placesOf = (day: Day) => day.items.flatMap((item) => item.poi_id ?? []);
const holding = (plan: Itinerary) =>
  plan.days.find((d) => d.items.some((item) => item.poi_id === 'agreed-gallery'));

describe('agreed sights before dinner', { timeout: 60_000 }, () => {
  it('seats a left-out agreed sight before dinner on a day in its own area', () => {
    let placed = 0;
    for (const crew of CREWS) {
      const plain = planInput(crew);
      const base = baselineItinerary(plain);
      for (const day of base.days) {
        const first = plain.pois.get(day.items.find((item) => item.kind !== 'meal')?.poi_id ?? '');
        if (first === undefined) continue;
        const input = withGallery(plain, galleryBy(first, 150));
        const after = placeAgreedSights(input, base.days.map(outlineOf), base).itinerary;
        const made = holding(after);
        if (made === undefined) continue;
        placed += 1;
        const others = placesOf(made).filter((id) => id !== 'agreed-gallery');
        expect(areaStep(input, 'agreed-gallery', others)).toBe(0);
        expect(afterDinner(input, made, 'agreed-gallery')).toBe(false);
      }
    }
    expect(placed).toBeGreaterThan(0);
  });

  it('never takes a day across town for it', () => {
    let checked = 0;
    for (const crew of CREWS) {
      const plain = planInput(crew);
      const base = baselineItinerary(plain);
      const first = plain.pois.get(base.days[0]?.items[0]?.poi_id ?? '');
      if (first === undefined) continue;
      const input = withGallery(plain, galleryBy(first, 60_000));
      if (base.days.some((day) => areaStep(input, 'agreed-gallery', placesOf(day)) < 2)) continue;
      checked += 1;
      const after = placeAgreedSights(input, base.days.map(outlineOf), base).itinerary;
      expect(holding(after)).toBeUndefined();
    }
    expect(checked).toBeGreaterThan(0);
  });
});
