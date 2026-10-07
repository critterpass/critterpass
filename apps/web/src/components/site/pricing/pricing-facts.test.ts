import type { PublicPerk } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { pricingFacts } from './pricing-facts';

const perk = (key: string, tier: PublicPerk['tier'], sort: number): PublicPerk => ({
  key,
  tier,
  copy_key: `monetize.perks.${key}`,
  sort,
});

describe('pricingFacts', () => {
  it('lists each plan’s perks in the server’s order', () => {
    const facts = pricingFacts([
      perk('boost_seats', 'boost', 130),
      perk('pass_plus_mailbox_import', 'pass_plus', 20),
      perk('boost_redrafts', 'boost', 110),
      perk('pass_plus_guide_unlimited', 'pass_plus', 10),
    ]);
    expect(facts?.passPlus.map((line) => line.key)).toEqual([
      'pass_plus_guide_unlimited',
      'pass_plus_mailbox_import',
    ]);
    expect(facts?.boost.map((line) => line.key)).toEqual(['boost_redrafts', 'boost_seats']);
  });

  it('leaves out a perk the site has no words for', () => {
    const facts = pricingFacts([
      perk('pass_plus_guide_unlimited', 'pass_plus', 10),
      perk('pass_plus_teleport', 'pass_plus', 15),
    ]);
    expect(facts?.passPlus.map((line) => line.key)).toEqual(['pass_plus_guide_unlimited']);
  });

  it('offers the free first trip only while the server lists it', () => {
    const paid = [perk('boost_redrafts', 'boost', 110)];
    expect(pricingFacts(paid)?.firstTripFree).toBe(false);
    expect(pricingFacts([...paid, perk('ftf_first_trip_free', 'ftf', 210)])?.firstTripFree).toBe(
      true,
    );
  });

  it('shows no section without a perk list or with no paid perk in it', () => {
    expect(pricingFacts(null)).toBeNull();
    expect(pricingFacts([])).toBeNull();
    expect(pricingFacts([perk('ftf_first_trip_free', 'ftf', 210)])).toBeNull();
  });
});
