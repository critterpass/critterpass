/** Fixture data for the destination lab scenes: crowd curves, picks and price rows. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { PickCard } from '../components/picks-row';
import type { PriceRow } from '../destination-model';

export const NOW = new Date('2026-10-01T09:00:00Z');
export const SEEN = '2026-10-01T06:00:00Z';

export const curve = (
  crowds: readonly number[],
  roles: Readonly<Record<number, [string, string?]>>,
) =>
  crowds.map((crowd_index, index) => ({
    month: index + 1,
    crowd_index,
    colour_role: roles[index + 1]?.[0] ?? 'normal',
    highlight_tag: roles[index + 1]?.[1] ?? null,
  }));

export const KYOTO_CURVE = curve([28, 30, 52, 88, 62, 42, 50, 54, 44, 58, 86, 36], {
  1: ['cheapest'],
  2: ['cheapest'],
  4: ['peak', 'blossoms'],
  11: ['peak', 'leaves'],
});
export const DA_NANG_CURVE = curve([40, 62, 58, 70, 82, 95, 100, 88, 46, 30, 26, 38], {
  6: ['peak', 'fireworks festival'],
  10: ['cheapest'],
  11: ['cheapest'],
});

export const pick = (id: string, name: string, category: string): PickCard => ({
  id,
  name,
  category,
  photo: null,
});
export const KYOTO_PICKS = [
  pick('kyoto-1', 'Fushimi Inari', 'temple_shrine'),
  pick('kyoto-2', 'Nishiki Market', 'market'),
  pick('kyoto-3', 'Arashiyama', 'nature'),
  pick('kyoto-4', 'Kiyomizu-dera', 'temple_shrine'),
];
export const DA_NANG_PICKS = [
  pick('da-nang-1', 'Bán đảo Sơn Trà', 'nature'),
  pick('da-nang-2', 'Ngũ Hành Sơn (Marble Mountains)', 'nature'),
  pick('da-nang-3', 'Chợ Cồn', 'market'),
  pick('da-nang-4', 'Bãi biển Mỹ Khê', 'beach'),
];

export const row = (over: Partial<PriceRow> & Pick<PriceRow, 'origin'>): PriceRow => ({
  mine: false,
  names: [],
  others: 0,
  price: null,
  seenAt: SEEN,
  ...over,
});
export const USD_ROWS: readonly PriceRow[] = [
  row({ origin: 'SIN', mine: true, names: ['Jordan'], price: { minor: 41_200, currency: 'USD' } }),
  row({ origin: 'KUL', names: ['Rin', 'Alex'], price: { minor: 36_800, currency: 'USD' } }),
  row({ origin: 'MNL', names: [], others: 2, seenAt: null }),
];
export const VND_ROWS: readonly PriceRow[] = [
  row({
    origin: 'SGN',
    mine: true,
    names: ['Nguyễn Thị Thanh Hương'],
    price: { minor: 12_500_000, currency: 'VND' },
  }),
  row({ origin: 'HAN', names: ['Khánh'], price: { minor: 2_350_000, currency: 'VND' } }),
];
