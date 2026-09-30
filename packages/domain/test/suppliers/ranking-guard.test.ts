/**
 * Commission never changes what the guide recommends: permuting (or inventing) commission rates
 * leaves the ranking of candidates and the partner chosen for each pick exactly as they were.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  AFFILIATE_PARTNERS,
  choosePartner,
  rankCandidates,
  type PartnerOption,
} from '../../src/suppliers';

const option = fc.record({
  partner: fc.constantFrom(...AFFILIATE_PARTNERS),
  available: fc.boolean(),
  priceMinor: fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
  commissionRate: fc.double({ min: 0, max: 0.5, noNaN: true }),
});

const candidate = fc.record({
  id: fc.uuid(),
  score: fc.double({ min: -1, max: 1, noNaN: true }),
  options: fc.array(option, { maxLength: 6 }),
});

function withRates<T extends { readonly options: readonly PartnerOption[] }>(
  candidates: readonly T[],
  rates: readonly number[],
): T[] {
  let next = 0;
  return candidates.map((c) => ({
    ...c,
    options: c.options.map((o) => ({ ...o, commissionRate: rates[next++ % rates.length] ?? 0 })),
  }));
}

function outcome(
  candidates: readonly { id: string; score: number; options: readonly PartnerOption[] }[],
) {
  return rankCandidates(candidates).map((c) => {
    const chosen = choosePartner(c.options);
    return [c.id, chosen === null ? null : [chosen.partner, chosen.priceMinor]];
  });
}

describe('commission-neutral ranking', { timeout: 60_000 }, () => {
  it('never changes order or partner choice when commission rates are permuted', () => {
    fc.assert(
      fc.property(
        fc.array(candidate, { maxLength: 12 }),
        fc.array(fc.double({ min: 0, max: 0.9, noNaN: true }), { minLength: 1, maxLength: 20 }),
        (candidates, rates) => {
          const baseline = outcome(candidates);
          expect(outcome(withRates(candidates, rates))).toEqual(baseline);
          expect(outcome(withRates(candidates, [...rates].reverse()))).toEqual(baseline);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('picks an available partner by price, then a fixed order', () => {
    const chosen = choosePartner<PartnerOption>([
      { partner: 'klook', available: true, priceMinor: 5000, commissionRate: 0.05 },
      { partner: 'viator', available: true, priceMinor: 5000, commissionRate: 0.08 },
      { partner: 'gyg', available: true, priceMinor: 4900, commissionRate: 0.01 },
      { partner: 'agoda', available: false, priceMinor: 100, commissionRate: 0.5 },
    ]);
    expect(chosen?.partner).toBe('gyg');
    expect(
      choosePartner<PartnerOption>([
        { partner: 'klook', available: true, priceMinor: 5000 },
        { partner: 'viator', available: true, priceMinor: 5000 },
      ])?.partner,
    ).toBe('viator');
    expect(choosePartner([{ partner: 'klook', available: false, priceMinor: 1 }])).toBeNull();
  });
});
