import { describe, expect, it } from 'vitest';

import { albumNoteFacts } from './note-facts';
import { selectAlbumPicks, type PickCandidate } from './select-picks';

const id = (n: number) => `0199a000-0000-7000-8000-${String(n).padStart(12, '0')}`;

function photo(n: number, overrides: Partial<PickCandidate> = {}): PickCandidate {
  return {
    id: id(n),
    local_date: '2026-10-02',
    quality: { blur: 200 },
    people: [],
    score: 5,
    user_pick: null,
    ...overrides,
  };
}

describe('selectAlbumPicks', () => {
  it('gives everyone tagged three photos before the best of the rest, and every day one', () => {
    const photos = [
      ...Array.from({ length: 30 }, (_, i) => photo(i + 1, { score: 9 })),
      ...[31, 32, 33, 34].map((n) => photo(n, { score: 2, people: ['dev'] })),
      photo(35, { score: 1, local_date: '2026-10-04' }),
    ];
    const { picks } = selectAlbumPicks(photos);
    expect(picks).toHaveLength(24);
    expect(picks.filter((p) => [id(31), id(32), id(33), id(34)].includes(p))).toHaveLength(3);
    expect(picks).toContain(id(35));
  });

  it("keeps a traveller's choice either way, and skips blurry photos and duplicates", () => {
    const photos = [
      photo(1, { score: 1, user_pick: true }),
      photo(2, { score: 10, user_pick: false }),
      photo(3, { score: 9, quality: { blur: 10 } }),
      photo(4, { score: 8, quality: { blur: 300, dup_cluster: 'a' } }),
      photo(5, { score: 7, quality: { blur: 300, dup_cluster: 'a' } }),
    ];
    expect(selectAlbumPicks(photos)).toEqual({
      picks: [id(4), id(1)],
      blurry: 1,
      duplicates: 1,
    });
  });
});

describe('albumNoteFacts', () => {
  it('says everyone is in three only when every tagged traveller really is', () => {
    const picks = [
      { local_date: '2026-10-02', people: ['ana', 'ben'] },
      { local_date: '2026-10-03', people: ['ana', 'ben'] },
      { local_date: '2026-10-03', people: ['ana'] },
    ];
    const base = { photos: 40, picks, blurry: 2, duplicates: 3 };
    expect(albumNoteFacts({ ...base, tagged: ['ana'] })).toMatchObject({
      everyone_in_three: true,
      people_in_three: 1,
      days: 2,
    });
    expect(albumNoteFacts({ ...base, tagged: ['ana', 'ben'] })).toMatchObject({
      everyone_in_three: false,
      people_in_three: 1,
    });
    expect(albumNoteFacts({ ...base, tagged: [] }).everyone_in_three).toBe(false);
  });
});
