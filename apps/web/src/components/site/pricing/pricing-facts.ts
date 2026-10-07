/* eslint-disable lingui/no-unlocalized-strings -- perk copy keys and store prices, not UI copy. */
/**
 * What the pricing section shows, from the server's perk list. A perk is listed only while its
 * catalogue row is switched on and the site has words for the row's `copy_key`, so a perk can be
 * withdrawn from the site without a release, and a perk the site has no words for is left out
 * rather than shown raw. The free column is the product's always-free set and never a perk row.
 */
import type { PublicPerk } from '@cp/domain';
import type { MessageDescriptor } from '@lingui/core';

import { pricingCopy as copy } from '../copy/pricing';

/**
 * The US store prices of Pass+ (docs/product-decisions.md §3). A Trip Boost's tier is not settled
 * there, so the site names no price for it and points at the stores.
 */
export const PASS_PLUS_PRICE = { monthly: '$3.99', yearly: '$29.99' } as const;

const PERK_WORDS: Readonly<Record<string, MessageDescriptor>> = {
  'monetize.perks.pass_plus_guide_unlimited': copy.perkPassGuide,
  'monetize.perks.pass_plus_mailbox_import': copy.perkPassMailbox,
  'monetize.perks.pass_plus_icon_styles': copy.perkPassIcons,
  'monetize.perks.pass_plus_no_sponsored': copy.perkPassNoSponsored,
  'monetize.perks.pass_plus_next_flight': copy.perkPassNextFlight,
  'monetize.perks.pass_plus_read_out': copy.perkPassReadOut,
  'monetize.perks.pass_plus_postcard': copy.perkPassPostcard,
  'monetize.perks.boost_guide_unlimited': copy.perkBoostGuide,
  'monetize.perks.boost_redrafts': copy.perkBoostRedrafts,
  'monetize.perks.boost_seats': copy.perkBoostSeats,
  'monetize.perks.boost_live_map': copy.perkBoostLiveMap,
  'monetize.perks.boost_no_sponsored': copy.perkBoostNoSponsored,
};

/** What every crew gets without paying (docs/product-decisions.md §3 "Always free"). */
export const FREE_LINES: readonly MessageDescriptor[] = [
  copy.freePlan,
  copy.freeOffline,
  copy.freeCritters,
  copy.freeFlights,
  copy.freeKept,
];

export interface PerkLine {
  readonly key: string;
  readonly words: MessageDescriptor;
}

export interface PricingFacts {
  readonly passPlus: readonly PerkLine[];
  readonly boost: readonly PerkLine[];
  /** Whether a crew's first trip is free right now. */
  readonly firstTripFree: boolean;
}

function lines(perks: readonly PublicPerk[], tier: PublicPerk['tier']): PerkLine[] {
  return perks
    .filter((perk) => perk.tier === tier)
    .sort((a, b) => a.sort - b.sort)
    .flatMap((perk) => {
      const words = PERK_WORDS[perk.copy_key];
      return words === undefined ? [] : [{ key: perk.key, words }];
    });
}

/** The section's content, or null when there is no paid plan to describe. */
export function pricingFacts(perks: readonly PublicPerk[] | null): PricingFacts | null {
  if (perks === null) return null;
  const passPlus = lines(perks, 'pass_plus');
  const boost = lines(perks, 'boost');
  if (passPlus.length === 0 && boost.length === 0) return null;
  return { passPlus, boost, firstTripFree: perks.some((perk) => perk.tier === 'ftf') };
}
