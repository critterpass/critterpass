import type { NamedPlace } from '@cp/ai';
import { describe, expect, it } from 'vitest';

import {
  matchNamedPlace,
  plainWords,
  searchWords,
  type PickCandidate,
} from '../../../src/places/pick/match';

const PLAIN = plainWords('Đà Lạt', 'Vietnam');

let next = 0;
const row = (name: string, category: string, extra: Partial<PickCandidate> = {}): PickCandidate => {
  next += 1;
  return {
    id: `row-${String(next).padStart(3, '0')}`,
    name,
    nameLocal: null,
    category,
    lat: 11.94,
    lng: 108.44,
    address: null,
    quality: 2,
    ...extra,
  };
};

const lead = (
  name: string,
  localName: string | null,
  kind: NamedPlace['kind'],
  area: string | null = null,
): NamedPlace => ({ name, localName, kind, area });

describe('matchNamedPlace', () => {
  const cases: readonly {
    readonly title: string;
    readonly lead: NamedPlace;
    readonly rows: readonly PickCandidate[];
    readonly expected: string | null;
  }[] = [
    {
      title: 'the local name, accents and case aside',
      lead: lead('Xuan Huong Lake', 'Hồ Xuân Hương', 'nature'),
      rows: [row('Cafe Hồ Xuân Hương', 'food'), row('HỒ XUÂN HƯƠNG', 'nature')],
      expected: 'HỒ XUÂN HƯƠNG',
    },
    {
      title: 'the English name on a row stored in English',
      lead: lead('Datanla Waterfall', 'Thác Datanla', 'nature'),
      rows: [row('Datanla Waterfalls', 'other')],
      expected: 'Datanla Waterfalls',
    },
    {
      title: 'a name in brackets beside the row’s own',
      lead: lead('Crazy House', 'Biệt thự Hằng Nga', 'other'),
      rows: [row('Hằng Nga Villa (Crazy House)', 'other')],
      expected: 'Hằng Nga Villa (Crazy House)',
    },
    {
      title: 'a row that adds the city to the name',
      lead: lead('Truc Lam Zen Monastery', 'Thiền viện Trúc Lâm', 'temple_shrine'),
      rows: [row('Thiền Viện Trúc Lâm Đà Lạt', 'temple_shrine')],
      expected: 'Thiền Viện Trúc Lâm Đà Lạt',
    },
    {
      title: 'a row one word longer, of the same kind',
      lead: lead('Bao Dai Summer Palace', 'Dinh Bảo Đại', 'museum'),
      rows: [row('Dinh III Bảo Đại', 'museum')],
      expected: 'Dinh III Bảo Đại',
    },
    {
      title: 'not a row one word longer of another kind',
      lead: lead('Xuan Huong Lake', 'Hồ Xuân Hương', 'nature'),
      rows: [row('Cafe Hồ Xuân Hương', 'food')],
      expected: null,
    },
    {
      title: 'not a place that shares only what kind of shop it is',
      lead: lead('Tiem Ca Phe 1985', 'Tiệm Cà Phê 1985', 'cafe'),
      rows: [row('Tiệm Cà Phê Số 3', 'food'), row('Tiệm Cà Phê Tùng', 'food')],
      expected: null,
    },
    {
      title: 'not a longer name that is another place',
      lead: lead('Truc Lam Zen Monastery', 'Thiền viện Trúc Lâm', 'temple_shrine'),
      rows: [row('Thiền viện Trúc Lâm Phương Nam Cần Thơ', 'temple_shrine')],
      expected: null,
    },
    {
      title: 'the market, not the city’s own row or the night market',
      lead: lead('Dalat Market', 'Chợ Đà Lạt', 'market'),
      rows: [row('Đà Lạt', 'other'), row('Chợ Đêm Đà Lạt', 'market'), row('Chợ Đà Lạt', 'market')],
      expected: 'Chợ Đà Lạt',
    },
    {
      title: 'nothing when only the city’s name is shared',
      lead: lead('Dalat Market', 'Chợ Đà Lạt', 'market'),
      rows: [row('Đà Lạt', 'other'), row('Dalat', 'market'), row('Chợ', 'market')],
      expected: null,
    },
    {
      title: 'the same name twice: the one of the named kind, then in the named area',
      lead: lead('An Cafe', null, 'cafe', '3 Tháng 2'),
      rows: [
        row('An Cafe', 'other', { quality: 4 }),
        row('An Cafe', 'food', { address: '12 Trần Phú' }),
        row('An Cafe', 'food', { address: '63 Bis Đường 3 Tháng 2, Đà Lạt' }),
      ],
      expected: '63 Bis Đường 3 Tháng 2, Đà Lạt',
    },
    {
      title: 'nothing for a place we have no row for',
      lead: lead('Moonstone Sky Bridge', 'Cầu Đá Trăng', 'other'),
      rows: [row('Cầu Ông Đạo', 'other'), row('Moonstone Spa', 'other')],
      expected: null,
    },
  ];

  it.each(cases)('matches $title', ({ lead: named, rows, expected }) => {
    const found = matchNamedPlace(named, rows, PLAIN);
    expect(expected?.includes(',') ? (found?.address ?? null) : (found?.name ?? null)).toBe(
      expected,
    );
  });

  it('breaks a full tie by quality', () => {
    const rows = [row('Maze Bar', 'nightlife', { quality: 1.5 }), row('Maze Bar', 'nightlife')];
    expect(matchNamedPlace(lead('Maze Bar', null, 'nightlife'), rows, PLAIN)?.id).toBe(rows[1]?.id);
  });
});

describe('searchWords', () => {
  it('searches by both names without the destination’s own words', () => {
    expect(searchWords(lead('Dalat Flower Gardens', 'Vườn hoa Đà Lạt', 'nature'), PLAIN)).toEqual([
      'flower',
      'gardens',
      'vuon',
      'hoa',
      'garden',
    ]);
  });
});
