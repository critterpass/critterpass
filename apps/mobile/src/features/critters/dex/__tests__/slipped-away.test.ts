/**
 * A revoked find is news for a week and only until it is dismissed on this phone; the latest one
 * is told, never one already put away.
 */
import { describe, expect, it } from '@jest/globals';

import { slippedAwayFor, type SlippedRow } from '../slipped-away';

const NOW = new Date('2026-10-03T08:00:00Z');
const row = (id: string, at: string | null, place: string | null = null): SlippedRow => ({
  id,
  verified_at: at,
  resolved_at: null,
  place,
  rarity: 'rare',
});

describe('slipped away', () => {
  it('tells the latest revoked find within a week, with its place', () => {
    expect(
      slippedAwayFor(
        [row('a', '2026-10-03T07:00:00Z', 'Dragon Bridge'), row('b', '2026-10-01T07:00:00Z')],
        NOW,
        () => false,
      ),
    ).toEqual({ encounterId: 'a', place: 'Dragon Bridge', rarity: 'rare' });
  });

  it('skips one dismissed on this phone, and one older than a week', () => {
    const rows = [row('a', '2026-10-03T07:00:00Z'), row('old', '2026-09-20T07:00:00Z')];
    expect(slippedAwayFor(rows, NOW, (id) => id === 'a')).toBeNull();
  });

  it('has nothing to say without a revoke time', () => {
    expect(slippedAwayFor([row('a', null)], NOW, () => false)).toBeNull();
  });
});
