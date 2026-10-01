import { describe, expect, it } from 'vitest';

import { budgetBreakdown, feasibleLow } from '../../src/budget/breakdown';
import { chooseStayMix } from '../../src/budget/stay-mix';
import { KYOTO_INDEX, dollars } from '../golden/design-chain.fixture';

const base = { flights: dollars(520), nights: 7, days: 8, index: KYOTO_INDEX };

describe('budget breakdown golden', () => {
  it('$1,350 = flights $520 + stays $470 + food $220 + fun $140, 2 ryokan nights + 5 apartment', () => {
    expect(budgetBreakdown({ ...base, target: dollars(1_350) })).toEqual({
      flights: dollars(520),
      stays: dollars(470),
      food: dollars(220),
      fun: dollars(140),
      stayMix: [
        { type: 'ryokan', nights: 2 },
        { type: 'apartment', nights: 5 },
      ],
      missing: [],
      fits: true,
    });
  });

  it('re-flows as the knob moves: more budget buys ryokan nights, less falls back', () => {
    expect(budgetBreakdown({ ...base, target: dollars(1_700) }).stayMix).toEqual([
      { type: 'ryokan', nights: 7 },
    ]);
    expect(budgetBreakdown({ ...base, target: dollars(1_200) }).stayMix).toEqual([
      { type: 'apartment', nights: 7 },
    ]);
  });

  it('a target below the cheapest mix does not fit and keeps the fun floor', () => {
    const result = budgetBreakdown({ ...base, target: dollars(900) });
    expect(result).toMatchObject({ fits: false, fun: dollars(100), stays: dollars(350) });
  });

  it('without an index shows flights and flags the rest missing', () => {
    expect(budgetBreakdown({ ...base, index: null, target: dollars(1_350) })).toMatchObject({
      flights: dollars(520),
      stays: null,
      missing: ['stays', 'food', 'fun'],
    });
    expect(budgetBreakdown({ ...base, flights: null, target: dollars(1_350) }).missing).toEqual([
      'flights',
    ]);
    expect(feasibleLow({ ...base, index: null })).toBeNull();
  });

  it('with no fare, the low end and the breakdown are the ground part alone', () => {
    const withFlight = feasibleLow(base);
    const ground = feasibleLow({ ...base, flights: null });
    expect(ground).toEqual(dollars(Number((withFlight?.amountMinor ?? 0n) / 100n) - 520));
    const result = budgetBreakdown({ ...base, flights: null, target: dollars(830) });
    expect(result.flights).toBeNull();
    expect(result.missing).toEqual(['flights']);
    expect(result.fits).toBe(true);
    // Nothing is set aside for a flight nobody priced: the whole target is stay, food and fun.
    expect(
      (result.stays?.amountMinor ?? 0n) +
        (result.food?.amountMinor ?? 0n) +
        (result.fun?.amountMinor ?? 0n),
    ).toBe(83_000n);
  });

  it('stay mix ties go to the first type key, and empty inputs give no mix', () => {
    const mix = chooseStayMix(
      [
        { type: 'hostel', nightlyPpMinor: 1_000n },
        { type: 'b-hotel', nightlyPpMinor: 3_000n },
        { type: 'a-hotel', nightlyPpMinor: 3_000n },
      ],
      2,
      4_000n,
    );
    expect(mix?.parts).toEqual([
      { type: 'a-hotel', nights: 1 },
      { type: 'hostel', nights: 1 },
    ]);
    expect(chooseStayMix([], 2, 1n)).toBeNull();
  });
});
