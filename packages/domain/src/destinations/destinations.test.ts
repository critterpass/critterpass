import { describe, expect, it } from 'vitest';

import { baseSlug, foldName, type BaseCandidate } from './base-set';
import { joinSources } from './join';
import { rankAndCap } from './rank';
import { planUpsert, type ExistingDestination } from './upsert-plan';

function candidate(overrides: Partial<BaseCandidate> & Pick<BaseCandidate, 'name'>): BaseCandidate {
  return {
    qid: null,
    geonamesId: null,
    names: {},
    countryCode: 'VN',
    admin1: null,
    kind: 'city',
    lat: 13.77,
    lng: 109.22,
    population: null,
    sitelinks: 0,
    photoFile: null,
    ...overrides,
  };
}

describe('base-set names', () => {
  it('folds Vietnamese accents and đ', () => {
    expect(foldName('Đà Nẵng')).toBe('da nang');
    expect(baseSlug('VN', 'Quy Nhơn')).toBe('vn-quy-nhon');
  });
});

describe('joinSources', () => {
  it('joins a GeoNames city to its Wikidata item by QID', () => {
    const item = candidate({ name: 'Quy Nhon', qid: 'Q1500', sitelinks: 60, photoFile: 'A.jpg' });
    const city = candidate({
      name: 'Qui Nhon',
      qid: 'Q1500',
      geonamesId: 1568574,
      admin1: 'Bình Định',
      population: 210_000,
      names: { vi: 'Quy Nhơn' },
      lat: 13.9,
    });
    const [joined, ...rest] = joinSources([item], [city]);
    expect(rest).toEqual([]);
    expect(joined).toMatchObject({
      qid: 'Q1500',
      geonamesId: 1568574,
      admin1: 'Bình Định',
      population: 210_000,
      photoFile: 'A.jpg',
      names: { vi: 'Quy Nhơn' },
    });
  });

  it('joins by shared folded name within 25 km, and not beyond', () => {
    const item = candidate({ name: 'Hội An', qid: 'Q200', sitelinks: 50, lat: 15.88, lng: 108.33 });
    const near = candidate({ name: 'Hoi An', geonamesId: 1, lat: 15.9, lng: 108.35 });
    const far = candidate({ name: 'Hoi An', geonamesId: 2, lat: 16.5, lng: 108.35 });
    const joined = joinSources([item], [near, far]);
    expect(joined).toHaveLength(2);
    expect(joined.find((row) => row.qid === 'Q200')?.geonamesId).toBe(1);
  });

  it('drops a same-name row within 5 km, keeping the better known', () => {
    const a = candidate({ name: 'Sa Pa', qid: 'Q1', sitelinks: 40 });
    const b = candidate({ name: 'Sapa', qid: 'Q2', sitelinks: 3, names: { en: 'Sa Pa' } });
    expect(joinSources([a, b], []).map((row) => row.qid)).toEqual(['Q1']);
  });
});

describe('rankAndCap', () => {
  const many = (country: string, n: number, sitelinks: number) =>
    Array.from({ length: n }, (_, i) =>
      candidate({ name: `${country}${i}`, countryCode: country, sitelinks: sitelinks - i / 1000 }),
    );

  it('caps each country, keeps all of Vietnam and a critter country’s floor', () => {
    const rows = [...many('FR', 20, 100), ...many('VN', 20, 90), ...many('PE', 12, 1)];
    const kept = rankAndCap(rows, {
      perCountry: 5,
      vietnamMax: 8,
      floor: 3,
      total: 14,
      critterCountries: new Set(['PE']),
    });
    const count = (c: string) => kept.filter((row) => row.countryCode === c).length;
    expect(kept).toHaveLength(14);
    expect(count('PE')).toBe(3);
    expect(count('VN')).toBe(8);
    expect(count('FR')).toBe(3);
  });

  it('ranks an island above a city of equal fame', () => {
    const [first] = rankAndCap(
      [
        candidate({ name: 'Town', sitelinks: 20 }),
        candidate({ name: 'Isle', sitelinks: 20, kind: 'island' }),
      ],
      { perCountry: 5, vietnamMax: 5, floor: 0, total: 5, critterCountries: new Set() },
    );
    expect(first?.name).toBe('Isle');
  });
});

describe('planUpsert', () => {
  const existing: ExistingDestination[] = [
    {
      id: 'd1',
      slug: 'da-nang',
      name: 'Đà Nẵng',
      country: 'Vietnam',
      countryCode: null,
      origin: 'seed',
      qid: null,
      geonamesId: null,
    },
    {
      id: 'd2',
      slug: 'vn-hoi-an',
      name: 'Hội An',
      country: 'Vietnam',
      countryCode: null,
      origin: 'critter',
      qid: null,
      geonamesId: null,
    },
    {
      id: 'd3',
      slug: 'us-springfield',
      name: 'Springfield',
      country: 'United States',
      countryCode: 'US',
      origin: 'base',
      qid: 'Q10',
      geonamesId: null,
    },
  ];
  const names = new Map([
    ['VN', 'Vietnam'],
    ['US', 'United States'],
  ]);

  it('enriches seed and critter rows by name and country, keeping their slugs', () => {
    const plan = planUpsert(
      [candidate({ name: 'Da Nang', qid: 'Q1' }), candidate({ name: 'Hoi An', qid: 'Q2' })],
      existing,
      names,
    );
    expect(plan.map((row) => [row.slug, row.existing?.id])).toEqual([
      ['da-nang', 'd1'],
      ['vn-hoi-an', 'd2'],
    ]);
  });

  it('gives a new namesake a suffixed slug and keeps an existing base row by QID', () => {
    const plan = planUpsert(
      [
        candidate({ name: 'Springfield', qid: 'Q10', countryCode: 'US' }),
        candidate({ name: 'Springfield', qid: 'Q11', countryCode: 'US', lat: 39.8, lng: -89.6 }),
      ],
      existing,
      names,
    );
    expect(plan.map((row) => [row.slug, row.existing?.id ?? null])).toEqual([
      ['us-springfield', 'd3'],
      ['us-springfield-2', null],
    ]);
  });
});
