/**
 * Perk lists are the server's: a perk switched off disappears from the paywall, the welcome and
 * the comparison without an app release, and a perk with no words is never shown raw.
 */
import type { Perk } from '@cp/entitlements';
import { describe, expect, it } from '@jest/globals';

import { compareRows, perkLines } from '../perk-copy';

const perk = (key: string, tier: Perk['tier'], sort: number, enabled = true): Perk => ({
  key,
  tier,
  copyKey: `monetize.perks.${key}`,
  enabled,
  sort,
});

describe('perkLines', () => {
  it('lists a tier in the server order, without disabled or unknown perks', () => {
    const lines = perkLines(
      [
        perk('pass_plus_icon_styles', 'pass_plus', 3),
        perk('pass_plus_guide_unlimited', 'pass_plus', 1),
        perk('pass_plus_mailbox_import', 'pass_plus', 2, false),
        perk('pass_plus_from_the_future', 'pass_plus', 0),
        perk('boost_live_map', 'boost', 1),
      ],
      'pass_plus',
    );
    expect(lines.map((line) => line.key)).toEqual([
      'pass_plus_guide_unlimited',
      'pass_plus_icon_styles',
    ]);
  });
});

describe('compareRows', () => {
  it('has no rows when the server lists no perks', () => {
    expect(compareRows([])).toEqual([]);
  });

  it('drops a row when its perk is switched off', () => {
    const on = compareRows([perk('boost_live_map', 'boost', 1), perk('boost_seats', 'boost', 2)]);
    expect(on.map((row) => row.id)).toEqual(['seats', 'live_map']);
    const off = compareRows([
      perk('boost_live_map', 'boost', 1, false),
      perk('boost_seats', 'boost', 2),
    ]);
    expect(off.map((row) => row.id)).toEqual(['seats']);
  });

  it('a plan whose own perk is off reads as free does in a shared row', () => {
    const [guide] = compareRows([perk('boost_guide_unlimited', 'boost', 1)]);
    expect(guide?.cells[1]).toEqual(guide?.cells[0]);
    expect(guide?.cells[2]).not.toEqual(guide?.cells[0]);
  });
});
