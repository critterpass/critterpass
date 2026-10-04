import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { PickCandidate } from '../../../src/places/pick/match';
import {
  dedupePlaces,
  PICK_BUCKETS,
  rankPicks,
  type PickBucket,
} from '../../../src/places/pick/select';

/** About 111 m per 0.001° of latitude. */
const at = (id: string, name: string, lat: number, lng = 108.44, nameLocal: string | null = null) =>
  ({
    id,
    name,
    nameLocal,
    category: 'food',
    lat,
    lng,
    address: null,
    quality: 2,
  }) satisfies PickCandidate;

describe('dedupePlaces', () => {
  const cases: readonly {
    readonly title: string;
    readonly rows: readonly PickCandidate[];
    readonly kept: readonly string[];
  }[] = [
    {
      title: 'the same name, accents and case aside, wherever it is',
      rows: [at('a', 'Phở Hiếu', 11.94), at('b', 'PHO HIEU', 11.99)],
      kept: ['a'],
    },
    {
      title: 'a local name that is another row’s name',
      rows: [
        at('a', 'Xuan Huong Lake', 11.94, 108.44, 'Hồ Xuân Hương'),
        at('b', 'Hồ Xuân Hương', 11.95),
      ],
      kept: ['a'],
    },
    {
      title: 'overlapping names within about 150 m',
      rows: [at('a', 'Chùa Linh Phước', 11.94), at('b', 'Linh Phước Pagoda', 11.9408)],
      kept: ['a'],
    },
    {
      title: 'not overlapping names that are far apart',
      rows: [at('a', 'Chùa Linh Phước', 11.94), at('b', 'Linh Phước Pagoda', 11.96)],
      kept: ['a', 'b'],
    },
    {
      title: 'not neighbours with different names',
      rows: [at('a', 'Bánh Căn Lệ', 11.94), at('b', 'Nem Nướng Bà Hùng', 11.9401)],
      kept: ['a', 'b'],
    },
    {
      title: 'the same row given twice',
      rows: [at('a', 'Maze Bar', 11.94), at('a', 'Maze Bar', 11.94)],
      kept: ['a'],
    },
  ];

  it.each(cases)('drops $title', ({ rows, kept }) => {
    expect(dedupePlaces(rows).map((row) => row.id)).toEqual(kept);
  });

  it('keeps the earlier row of a pair and is stable on its own output', { timeout: 60_000 }, () => {
    const names = ['An Cafe', 'Chợ Đà Lạt', 'Maze Bar', 'Phở Hiếu', 'Hồ Tuyền Lâm', 'Cafe An'];
    const rowArb = fc.record({
      name: fc.constantFrom(...names),
      lat: fc.integer({ min: 0, max: 40 }).map((step) => 11.94 + step * 0.0005),
    });
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 30 }), (drawn) => {
        const rows = drawn.map((row, index) => at(`r${index}`, row.name, row.lat));
        const kept = dedupePlaces(rows);
        // A subsequence of the input that starts with its first row.
        expect(kept.map((row) => row.id)).toEqual(
          rows.filter((row) => kept.includes(row)).map((row) => row.id),
        );
        if (rows.length > 0) expect(kept[0]).toBe(rows[0]);
        // No two kept rows carry the same folded name, and nothing more goes on a second pass.
        const folded = kept.map((row) => row.name.toLowerCase());
        expect(new Set(folded).size).toBe(folded.length);
        expect(dedupePlaces(kept)).toEqual(kept);
      }),
      { numRuns: 200 },
    );
  });
});

function bucketRows(bucket: PickBucket, count: number, offset: number): PickCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    ...at(`${bucket}-${index + 1}`, `${bucket} place ${index + 1} zz${offset + index}`, 0),
    // A grid a kilometre apart, so nothing here is one place twice.
    lat: 11 + (offset + index) * 0.01,
  }));
}

function fillOf(counts: Partial<Record<PickBucket, number>>) {
  let offset = 0;
  return Object.fromEntries(
    PICK_BUCKETS.map((bucket) => {
      const rows = bucketRows(bucket, counts[bucket] ?? 0, offset);
      offset += rows.length;
      return [bucket, rows];
    }),
  ) as Record<PickBucket, PickCandidate[]>;
}

const countBy = (ids: readonly string[]) => {
  const counts: Record<string, number> = {};
  for (const id of ids) {
    const bucket = id.split('-')[0] as string;
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
};

describe('rankPicks', () => {
  it('ranks the named places first, in their order, then a mix of the fill', () => {
    const named = [
      { ...at('n1', 'Crazy House', 12.5), category: 'other' },
      { ...at('n2', 'Chợ Đà Lạt', 12.6), category: 'market' },
    ];
    const picks = rankPicks(named, fillOf({ sights: 3, food: 3, cafe: 3, market: 1 }), 8);
    expect(picks.map((pick) => pick.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(picks.slice(0, 2)).toEqual([
      { id: 'n1', rank: 1, source: 'named' },
      { id: 'n2', rank: 2, source: 'named' },
    ]);
    // In turn within each kind's share (two sights, one of the others), then what is left.
    expect(picks.slice(2).map((pick) => pick.id)).toEqual([
      'sights-1',
      'food-1',
      'cafe-1',
      'market-1',
      'sights-2',
      'sights-3',
    ]);
    expect(picks.slice(2).every((pick) => pick.source === 'fill')).toBe(true);
  });

  it('holds food to its share while other kinds have places left', () => {
    const picks = rankPicks(
      [],
      fillOf({ sights: 100, food: 400, cafe: 100, market: 100, nightlife: 100, shopping: 100 }),
      100,
    );
    expect(countBy(picks.map((pick) => pick.id))).toEqual({
      sights: 36,
      food: 22,
      cafe: 14,
      market: 6,
      nightlife: 10,
      shopping: 12,
    });
  });

  it('hands a kind’s unused seats to the others', () => {
    // Shares first (11 food, 7 cafes), then the 30 seats nobody else can fill, in turn.
    const picks = rankPicks([], fillOf({ sights: 2, food: 400, cafe: 30 }), 50);
    expect(countBy(picks.map((pick) => pick.id))).toEqual({ sights: 2, food: 26, cafe: 22 });
  });

  it('never fills a seat with a place that was named, by id or by name', () => {
    const fill = fillOf({ food: 3 });
    const named = [fill.food[0] as PickCandidate, at('n2', 'food place 2 zz1', 14)];
    const picks = rankPicks(named, fill, 10);
    expect(picks.map((pick) => pick.id)).toEqual(['food-1', 'n2', 'food-3']);
  });
});
