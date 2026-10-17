/**
 * Of two places one outing holds, where the day has time for only one, the one itinerary pages
 * hold more keeps the seat, whichever the guide listed first; an essential never gives it up.
 */
import type { DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { CREWS, planInput } from '../evals/draft/cases';
import type { DraftPlanInput } from '../src/prompts/draft/context';
import { intoPairedSeat } from '../src/prompts/draft/paired-seats';

function withPair(lake: Partial<DraftPoi>, pagoda: Partial<DraftPoi>): DraftPlanInput {
  const input = planInput(CREWS[0]!);
  const base = [...input.pois.values()][0]!;
  const plain = { ...base, essential: false, essentialRank: null, mustSee: true };
  const pois = new Map(input.pois);
  pois.set('lake', { ...plain, id: 'lake', name: 'Lake', pairsWith: ['pagoda'], ...lake });
  pois.set('pagoda', { ...plain, id: 'pagoda', name: 'Pagoda', pairsWith: [], ...pagoda });
  return { ...input, pois };
}

/** A day with time for one of the two. */
const one = (ids: readonly string[]) =>
  ids.filter((x) => x === 'lake' || x === 'pagoda').length < 2;

describe('paired seats', () => {
  it('gives the seat to the place more pages hold', () => {
    const input = withPair({ blogCount: 1 }, { blogCount: 6 });
    const kept = ['lake'];
    expect(intoPairedSeat(input, kept, 'pagoda', one)).toBe('lake');
    expect(kept).toEqual(['pagoda']);
  });

  it('keeps the seat of the place pages hold as much or more', () => {
    const input = withPair({ blogCount: 6 }, { blogCount: 6 });
    const kept = ['lake'];
    expect(intoPairedSeat(input, kept, 'pagoda', one)).toBeNull();
    expect(kept).toEqual(['lake']);
  });

  it('never takes an essential’s seat', () => {
    const input = withPair(
      { blogCount: 1, essential: true, essentialRank: 2 },
      { blogCount: 6, essential: true, essentialRank: 1 },
    );
    const kept = ['lake'];
    expect(intoPairedSeat(input, kept, 'pagoda', one)).toBeNull();
  });
});
