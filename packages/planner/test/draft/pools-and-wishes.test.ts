import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  candidatePools,
  collapseSamePlaces,
  destinationPhrases,
  matchWish,
  nameAliases,
  resolveWishes,
  type DraftPoi,
} from '../../src/draft/index';
import { AN_THUONG, AUTO, CURATED, D, FRAME, IGNORE, id } from './da-nang-fixture';

const ALL = [...CURATED, ...Object.values(AUTO)];
const names = (pois: readonly DraftPoi[]) => pois.map((poi) => poi.name);

describe('names inside a place name', () => {
  it('reads a bracketed name as the place’s own and later parts as where it is', () => {
    expect(nameAliases('Ngũ Hành Sơn (Marble Mountain)', IGNORE)).toEqual({
      primary: [
        ['ngu', 'hanh', 'son'],
        ['marble', 'mountain'],
      ],
      secondary: [],
    });
    expect(nameAliases('Cà Phê Trứng 3T - Cầu Rồng - Đà Nẵng', IGNORE)).toEqual({
      primary: [['ca', 'phe', 'trung', '3t']],
      secondary: [['cau', 'rong']],
    });
  });

  it('ignores the destination’s own name, however the country is written', () => {
    expect(destinationPhrases('Đà Nẵng, Vietnam')).toEqual([
      ['da', 'nang'],
      ['vietnam'],
      ['viet', 'nam'],
    ]);
  });
});

describe('a hand-typed must-do', () => {
  it('finds the place named inside the text, in English or Vietnamese, with or without accents', () => {
    expect(names(matchWish('Marble Mountains at sunrise', ALL, IGNORE).named)).toEqual([
      'Marble Mountains',
      'Ngũ Hành Sơn (Marble Mountain)',
    ]);
    expect(names(matchWish('ngu hanh son', ALL, IGNORE).named)).toEqual([
      'Ngũ Hành Sơn (Marble Mountain)',
    ]);
    expect(names(matchWish('cầu rồng phun lửa', ALL, IGNORE).named)).toEqual([
      'Cầu Rồng, Cầu Quay Sông Hàn, Cầu Tình Yêu, Cầu Trần Thị Lý',
    ]);
  });

  it('takes the longest name the text holds', () => {
    expect(names(matchWish('the Marble Mountains elevator', ALL, IGNORE).named)).toEqual([
      'Marble Mountains Elevator',
    ]);
  });

  it('offers, but never chooses, a curated place that only sits near the wished name', () => {
    const match = matchWish('cầu rồng phun lửa', ALL, IGNORE);
    expect(names(match.near)).toEqual(['Cà Phê Trứng 3T - Cầu Rồng - Đà Nẵng']);
  });

  it('uses open-data rows only when no curated place is named, and only on a full name', () => {
    expect(names(matchWish('Bà Nà Hills', ALL, IGNORE).named)).toEqual([
      'Bà Nà Hills',
      'Ba Na Hills',
      'Bà Nà Hill, Đà Nẵng, Việt Nam',
    ]);
    // A land advert that mentions the mountain never stands in for it.
    expect(names(matchWish('Ngũ Hành Sơn', ALL, IGNORE).named)).toEqual([
      'Ngũ Hành Sơn (Marble Mountain)',
    ]);
    expect(matchWish('somewhere nice for dinner', ALL, IGNORE)).toEqual({ named: [], near: [] });
  });
});

describe('resolving wishes', () => {
  const wishes = [
    { id: id(701), text: 'Marble Mountains at sunrise' },
    { id: id(702), text: 'Bà Nà Hills' },
    { id: id(703), text: 'cầu rồng phun lửa' },
    { id: id(704), text: 'a quiet beach' },
    { id: id(705), text: 'Linh Ứng pagoda' },
  ];
  const resolved = resolveWishes(wishes, ALL, IGNORE);

  it('gives a wish its place when every match is one place', () => {
    // Two rows, one mountain: the rows are 60 m apart and share the name.
    expect([D.marble.id, D.nguHanhSon.id]).toContain(resolved.places.get(id(701)));
    expect(resolved.places.get(id(703))).toBe(D.cauRong.id);
  });

  it('takes a famous place the curated set lacks from the open data, at the pin the rows agree on', () => {
    // Three rows carry the name; the one 14 km from the other two is the stray.
    expect([AUTO.baNa.id, AUTO.baNaLong.id]).toContain(resolved.places.get(id(702)));
  });

  it('leaves a wish that names no place a wish', () => {
    expect(resolved.places.has(id(704))).toBe(false);
  });

  it('offers what sits near a wished name without making it the must-do', () => {
    // The café by the Dragon Bridge, the cave on the Marble Mountains, the Buddha at Bà Nà.
    expect([...resolved.offered].sort()).toEqual(
      [D.eggCoffee.id, D.heavenGate.id, D.buddhaBaNa.id].sort(),
    );
    expect(resolved.offered).not.toContain(D.cauRong.id);
  });

  it('leaves a wish that names different places a wish, and offers them all', () => {
    const two = resolveWishes(
      [{ id: id(706), text: 'Golden Bridge or Dragon Bridge' }],
      ALL,
      IGNORE,
    );
    expect(two.places.size).toBe(0);
    expect([...two.offered].sort()).toEqual([D.dragon.id, D.goldenBridge.id].sort());
  });
});

describe('one row per place', () => {
  it('collapses rows within 150 m whose names overlap, keeping count of them', () => {
    const { kept, mentions } = collapseSamePlaces([D.linhUng, D.linhUngEn, D.myKhe], {
      ignore: IGNORE,
    });
    expect(names(kept)).toEqual(['Linh Ứng Pagoda', 'Bãi biển Mỹ Khê']);
    expect(mentions.get(D.linhUngEn.id)).toBe(2);
  });

  it('collapses rows that carry the same name wherever their pins are, but not food', () => {
    const passes = collapseSamePlaces([D.haiVan1, D.haiVan2, D.haiVan3], { ignore: IGNORE });
    expect(passes.kept).toHaveLength(1);
    // The pin in the city is the stray: the row kept is one of the two on the pass.
    expect(passes.kept[0]?.id).not.toBe(D.haiVan3.id);
    const cafes = [1, 2].map((n) => ({
      ...D.eggCoffee,
      id: id(800 + n),
      name: 'Highlands Coffee',
      lat: 16 + n / 50,
    }));
    expect(collapseSamePlaces(cafes).kept).toHaveLength(2);
  });

  it('keeps neighbours with different names apart', () => {
    const { kept } = collapseSamePlaces([D.hanMarket, D.cauRong, D.eggCoffee], { ignore: IGNORE });
    expect(kept).toHaveLength(3);
  });

  it('keeps a must-do’s own row, the must-see row, then the better described', () => {
    const bare = { ...D.linhUngEn, detail: 1 };
    expect(collapseSamePlaces([bare, D.linhUng]).kept[0]?.id).toBe(D.linhUng.id);
    const star = { ...bare, mustSee: true };
    expect(collapseSamePlaces([D.linhUng, star]).kept[0]?.id).toBe(star.id);
    expect(
      collapseSamePlaces([D.linhUng, star], { keep: new Set([D.linhUng.id]) }).kept.map(
        (p) => p.id,
      ),
    ).toEqual([D.linhUng.id]);
  });
});

describe('the guide’s lists', () => {
  const pools = candidatePools({
    pois: [...CURATED],
    frame: FRAME,
    tastes: {},
    ignoreNames: IGNORE,
  });
  const offered = names(pools.activities);

  it('are not the alphabet: the famous places are on them', () => {
    expect(pools.activities).toHaveLength(24);
    const listed = new Set(pools.activities.map((poi) => poi.id));
    // Each sight by any of the rows that name it.
    for (const rows of [
      [D.marble, D.nguHanhSon],
      [D.dragon],
      [D.myKhe, D.myKheEn],
      [D.chamMuseum],
      [D.goldenBridge],
    ]) {
      expect(rows.some((poi) => listed.has(poi.id))).toBe(true);
    }
  });

  it('put the places listed most often first', () => {
    const first = new Set(pools.activities.slice(0, 3).map((poi) => poi.id));
    // Marble Mountains (four rows) and the Hải Vân pass (three).
    expect(
      [D.marble.id, D.nguHanhSon.id, D.marbleLift.id, D.heavenGate.id].some((x) => first.has(x)),
    ).toBe(true);
    expect([D.haiVan1.id, D.haiVan2.id].some((x) => first.has(x))).toBe(true);
  });

  it('offer each place once', () => {
    const passes = pools.activities.filter((poi) => /h[aả]i v[aâ]n pass/iu.test(poi.name));
    expect(passes).toHaveLength(1);
    expect(offered.filter((name) => /Linh Ứng Pagoda|Linh Ung Pagoda/u.test(name))).toHaveLength(1);
  });

  it('spread across kinds of place and across the city: one street cannot fill them', () => {
    const street = pools.activities.filter((poi) => AN_THUONG.includes(poi));
    expect(street.length).toBeLessThanOrEqual(12);
    expect(new Set(pools.activities.map((poi) => poi.category)).size).toBeGreaterThanOrEqual(6);
  });

  it('keep seats for the places everybody goes to, whatever the crew’s tastes lift', () => {
    // Every bar and gallery on the street scores above the sights for this crew.
    const tastes = { nightlife: 1, museums: 1 };
    const lifted = candidatePools({
      pois: [...CURATED],
      frame: FRAME,
      tastes,
      ignoreNames: IGNORE,
    });
    const listed = new Set(lifted.activities.map((poi) => poi.id));
    // Marble Mountains (three rows), the Hải Vân pass (three) and Linh Ứng (two) head the list.
    const head = lifted.activities.slice(0, 4).map((poi) => poi.id);
    expect(head.some((x) => [D.marble.id, D.nguHanhSon.id].includes(x))).toBe(true);
    expect(head.some((x) => [D.haiVan1.id, D.haiVan2.id].includes(x))).toBe(true);
    expect(head.some((x) => [D.linhUng.id, D.linhUngEn.id].includes(x))).toBe(true);
    expect([D.myKhe.id, D.myKheEn.id].some((x) => listed.has(x))).toBe(true);
    // Only four places are listed twice or more here: the other seats go by score, spread out.
    expect(lifted.activities).toHaveLength(24);
    expect(new Set(lifted.activities.map((poi) => poi.category)).size).toBeGreaterThanOrEqual(3);
    expect(listed.has(D.chamMuseum.id)).toBe(true);
    const again = candidatePools({
      pois: [...CURATED].reverse(),
      frame: FRAME,
      tastes,
      ignoreNames: IGNORE,
    });
    expect(again.activities.map((poi) => poi.id)).toEqual(lifted.activities.map((poi) => poi.id));
  });

  it('keep at most a third of the list for them', () => {
    // Twelve sights, each listed twice, and a crew whose taste lifts every bar above them.
    const twice = Array.from({ length: 12 }, (_, n) =>
      [0, 1].map((copy) => ({
        ...D.myKhe,
        id: id(600 + n * 2 + copy),
        name: `Sight ${String.fromCharCode(65 + n)}${String.fromCharCode(75 + n)} Beach`,
        lat: 16.2 + n / 50,
      })),
    ).flat();
    const lifted = candidatePools({
      pois: [...AN_THUONG, ...twice],
      frame: FRAME,
      tastes: { nightlife: 1, museums: 1 },
      ignoreNames: IGNORE,
    });
    const sights = lifted.activities.filter((poi) => poi.category === 'beach');
    expect(sights).toHaveLength(8);
    expect(lifted.activities.slice(0, 8).every((poi) => poi.category === 'beach')).toBe(true);
  });

  it('always carry the places a wish may mean, and a wish’s own place as its must-do', () => {
    const wished = resolveWishes(
      [{ id: id(701), text: 'Marble Mountains at sunrise' }],
      ALL,
      IGNORE,
    );
    const place = wished.places.get(id(701)) as string;
    const withWish = candidatePools({
      pois: [...CURATED],
      frame: {
        ...FRAME,
        mustDos: [
          { id: id(701), ownerId: id(901), poiId: place, title: 'Marble Mountains at sunrise' },
        ],
      },
      tastes: {},
      include: [D.eggCoffee.id],
      ignoreNames: IGNORE,
    });
    expect(withWish.mustDos).toEqual([{ mustDoId: id(701), poiId: place, openDays: [1, 2, 3] }]);
    expect(withWish.unplaceable).toEqual([]);
    // No other row of the mountain is offered beside the must-do (the cave on it is its own sight).
    expect(
      names(withWish.activities).filter((name) => /^marble mountains|^ngũ hành/iu.test(name)),
    ).toEqual([]);
    expect(withWish.meals.map((poi) => poi.id)).toContain(D.eggCoffee.id);
  });

  it('are the same for the same places in any order', { timeout: 60_000 }, () => {
    const expected = pools.activities.map((poi) => poi.id);
    fc.assert(
      fc.property(fc.shuffledSubarray([...CURATED], { minLength: CURATED.length }), (shuffled) => {
        const again = candidatePools({
          pois: shuffled,
          frame: FRAME,
          tastes: {},
          ignoreNames: IGNORE,
        });
        expect(again.activities.map((poi) => poi.id)).toEqual(expected);
      }),
      { numRuns: 60 },
    );
  });
});
