/** Fixed perks and helpers the monetization lab scenes share. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture keys, never shipped copy. */
import type { Perk } from '@cp/entitlements';

import type { RestoreState } from '../data/use-billing';
import { perkLines } from '../perks/perk-copy';

export const noop = () => undefined;
export const NO_RESTORE: RestoreState = { status: 'idle' };

const perk = (key: string, tier: Perk['tier'], sort: number): Perk => ({
  key,
  tier,
  copyKey: `monetize.perks.${key}`,
  enabled: true,
  sort,
});

export const PERKS: readonly Perk[] = [
  perk('pass_plus_guide_unlimited', 'pass_plus', 1),
  perk('pass_plus_mailbox_import', 'pass_plus', 2),
  perk('pass_plus_icon_styles', 'pass_plus', 3),
  perk('pass_plus_no_sponsored', 'pass_plus', 4),
  perk('boost_redrafts', 'boost', 1),
  perk('boost_live_map', 'boost', 2),
  perk('boost_seats', 'boost', 3),
  perk('boost_guide_unlimited', 'boost', 4),
  perk('boost_no_sponsored', 'boost', 5),
];
export const PASS_PERKS = perkLines(PERKS, 'pass_plus');
export const BOOST_PERKS = perkLines(PERKS, 'boost');
