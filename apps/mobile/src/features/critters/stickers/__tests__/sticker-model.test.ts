import { dexCounts } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import { shelfItems, type StickerRow } from '../sticker-model';

const ME = 'u-me';

function row(changes: Partial<StickerRow>): StickerRow {
  return {
    id: 's1',
    user_id: ME,
    crew_id: 'crew-1',
    trip_id: 'trip-1',
    kind: 'settled',
    level: null,
    granted_at: '2026-10-04T12:00:00Z',
    crew_name: 'Da Nang Four',
    place: 'Da Nang',
    guide_slug: 'chava',
    ...changes,
  };
}

const rows = [
  row({ id: 'settled' }),
  row({
    id: 'lvl2',
    user_id: null,
    kind: 'crew_level',
    level: 2,
    granted_at: '2026-10-03T09:00:00Z',
  }),
  row({
    id: 'lvl4',
    user_id: null,
    kind: 'crew_level',
    level: 4,
    granted_at: '2026-10-05T09:00:00Z',
  }),
  row({ id: 'theirs', user_id: 'u-other' }),
  row({ id: 'odd', kind: 'coupon' }),
];

describe('sticker shelf', () => {
  it("shows the traveller's own and their crews' stickers, newest first", () => {
    expect(shelfItems(rows, ME).map((item) => [item.id, item.kind, item.level])).toEqual([
      ['lvl4', 'crew_level', 4],
      ['settled', 'settled', null],
      ['lvl2', 'crew_level', 2],
    ]);
  });

  it("dresses the Settled Tokek as Tokek and crew levels as the trip's guide", () => {
    const byId = new Map(shelfItems(rows, ME).map((item) => [item.id, item.guide]));
    expect(byId.get('settled')).toBe('tokek');
    expect(byId.get('lvl4')).toBe('chava');
  });

  it('never counts a sticker in the dex: the dex reads collection entries alone', () => {
    const shelf = shelfItems(rows, ME);
    expect(shelf).toHaveLength(3);
    const counts = dexCounts({ critters: [], forms: [], entries: [] });
    expect(counts.forms).toBe(0);
    expect(counts.perSet.size).toBe(0);
    // Nothing on the shelf is a form an avatar or app icon could be made from.
    for (const item of shelf) expect(item).not.toHaveProperty('form_id');
  });
});
