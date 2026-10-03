/** "From your Critterdex" lists each owned form once, rarest first, with its rarity ring. */
import { describe, expect, it } from '@jest/globals';

import { ownedFormsOf } from '../owned-form-order';

describe('ownedFormsOf', () => {
  it('puts legendary, then epic, then rare first, and plain forms after with no ring', () => {
    expect(
      ownedFormsOf([
        { key: 'cp-002:common', rarity: 'common' },
        { key: 'cp-151:legendary', rarity: 'legendary' },
        { key: 'cp-010:rare', rarity: 'rare' },
        { key: 'cp-020:epic', rarity: 'epic' },
      ]),
    ).toEqual([
      { key: 'cp-151:legendary', ring: 'legendary' },
      { key: 'cp-020:epic', ring: 'epic' },
      { key: 'cp-010:rare', ring: 'rare' },
      { key: 'cp-002:common', ring: null },
    ]);
  });
});
