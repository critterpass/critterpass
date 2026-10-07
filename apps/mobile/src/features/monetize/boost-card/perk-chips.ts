/**
 * The short perk chips on the crew's boost card. Which chips show is the server's call (the
 * switched-on boost perks, in its order); the words for each live here, and a perk this version
 * has no chip for is left out.
 */
import type { Perk } from '@cp/entitlements';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

const CHIP: Readonly<Record<string, MessageDescriptor>> = {
  boost_redrafts: msg({ id: 'monetize.card.chip.redrafts', message: '∞ redrafts' }),
  boost_live_map: msg({ id: 'monetize.card.chip.liveMap', message: 'Live map' }),
  boost_guide_unlimited: msg({ id: 'monetize.card.chip.guide', message: 'Unlimited guide' }),
  boost_seats: msg({ id: 'monetize.card.chip.seats', message: 'Up to 16' }),
  boost_no_sponsored: msg({ id: 'monetize.card.chip.sponsored', message: 'No sponsored picks' }),
};

/* eslint-disable-next-line lingui/no-unlocalized-strings -- a perk key from the server's list. */
export const REDRAFTS_PERK = 'boost_redrafts';

export function boostChips(
  perks: readonly Perk[],
): { readonly key: string; readonly copy: MessageDescriptor }[] {
  return perks
    .filter((perk) => perk.enabled && perk.tier === 'boost')
    .sort((a, b) => a.sort - b.sort)
    .flatMap((perk) => {
      const copy = CHIP[perk.key];
      return copy === undefined ? [] : [{ key: perk.key, copy }];
    });
}
