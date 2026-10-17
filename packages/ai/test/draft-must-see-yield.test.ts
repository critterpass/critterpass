/**
 * A must-see that is neither an essential nor on the pages' days and that suits none of the crew's
 * tastes gives way to a place pages agree on that suits the crew. Essentials, must-sees on the
 * pages' days and every must-see of a crew with no tastes keep their place.
 */
import { tasteScore, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { fillersOf } from '../src/prompts/draft/agreed-sights';
import type { DraftPlanInput } from '../src/prompts/draft/context';
import { byVariety } from '../src/prompts/draft/variety';

const TASTES = { photo_spots: 2 };

/** A must-see our editors flag that one page holds, to nobody's taste. */
const mustSee = (poi: DraftPoi): DraftPoi => ({
  ...poi,
  tags: [],
  mustSee: true,
  blogCount: 1,
  essential: false,
  essentialRank: null,
  prominence: null,
});

/** A place five pages hold that suits a crew after photo spots; not a must-see. */
const agreedSuiting = (poi: DraftPoi): DraftPoi => ({
  ...poi,
  id: 'agreed-suiting',
  tags: ['photo_spots'],
  mustSee: false,
  blogCount: 5,
  essential: false,
  essentialRank: null,
  prominence: null,
});

function withPlaces(
  input: DraftPlanInput,
  places: readonly DraftPoi[],
  tastes: DraftPlanInput['tastes'],
): DraftPlanInput {
  const pois = new Map([...input.pois, ...places.map((p) => [p.id, p] as const)]);
  return { ...input, pois, tastes };
}

describe('a must-see gives way for the crew', () => {
  const plain = planInput(CREWS[0]!);
  const [first, second] = plain.pools.sights.filter(
    (poi) => tasteScore(mustSee(poi), TASTES) === 0,
  );
  if (first === undefined || second === undefined) throw new Error('no two plain sights');

  it('ranks a place pages agree on that suits the crew before a must-see that may give way', () => {
    const held = mustSee(first);
    const suiting = agreedSuiting({ ...second, category: first.category });
    const order = (input: DraftPlanInput) =>
      byVariety(input, [held, suiting], [], []).map((poi) => poi.id);
    expect(order(withPlaces(plain, [held, suiting], TASTES))).toEqual([suiting.id, held.id]);
    // A crew with no tastes, an essential and a must-see on the pages' days keep the lead.
    expect(order(withPlaces(plain, [held, suiting], {}))).toEqual([held.id, suiting.id]);
    const essential = { ...held, essential: true };
    expect(
      byVariety(withPlaces(plain, [essential, suiting], TASTES), [essential, suiting], [], [])[0]
        ?.id,
    ).toBe(held.id);
    const onDays: DraftPlanInput = {
      ...withPlaces(plain, [held, suiting], TASTES),
      firstVisit: {
        days: [
          { theme: 'old town', areas: [], stops: [{ name: held.name, poiId: held.id }], pages: 3 },
        ],
      },
    };
    expect(order(onDays)).toEqual([held.id, suiting.id]);
  });

  it('offers the seat of a must-see that may give way only to an agreed place that suits', () => {
    const base = baselineItinerary(plain);
    let checked = 0;
    for (const day of base.days) {
      for (const item of day.items) {
        const own = plain.pois.get(item.poi_id ?? '');
        if (item.kind === 'meal' || own === undefined || own.essential === true) continue;
        const held = mustSee(own);
        if (tasteScore(held, TASTES) > 0) continue;
        const suiting = agreedSuiting(own);
        const input = withPlaces(plain, [held, suiting], TASTES);
        if (!fillersOf(input, day, suiting).includes(item)) continue;
        checked += 1;
        expect(fillersOf(input, day).includes(item)).toBe(false);
        expect(fillersOf(input, day, { ...suiting, tags: [] }).includes(item)).toBe(false);
        expect(fillersOf(withPlaces(plain, [held, suiting], {}), day, suiting)).not.toContain(item);
        const essential = withPlaces(plain, [{ ...held, essential: true }, suiting], TASTES);
        expect(fillersOf(essential, day, suiting)).not.toContain(item);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
