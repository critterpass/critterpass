/**
 * A driver pick in the changes review: the op becomes a card with the driver and no plan item
 * sides, and its row sits on the first day he is asked for with his days and terms under his name.
 */
// The drivers area's index also draws its cards (Skia, the device database), which do not exist
// under Jest: these tests read its change card model, the real one, straight from its module.
jest.mock('@/features/drivers', () =>
  jest.requireActual<object>('../../../drivers/pick/pick-card'),
);
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { ChangeSetOp } from '@cp/domain';
import { i18n } from '@lingui/core';

import { driverPickOf } from '@/features/drivers';

import { changeRows } from '../changes-rows';
import { pickedProviders } from '../data/picked-providers';
import { buildChangeCards, predictDecider } from '../model/review-model';

const MADE = '0192f000-0000-7000-8000-0000000000d1';
const op: ChangeSetOp = {
  op: 'assign_provider',
  target: MADE,
  assignment: {
    days: [
      { date: '2026-10-15', window_start: '09:00', window_end: '17:00', pickup: null },
      { date: '2026-10-14', window_start: '08:00', window_end: '18:00', pickup: 'Ubud' },
    ],
  },
  reason: 'driver_pick',
  affected_user_ids: [],
  booking_impact: false,
};
const providers = pickedProviders([
  {
    id: MADE,
    name: 'Made',
    price_minor: '70000000',
    currency: 'IDR',
    price_unit: 'day',
    included_hours: '10',
  },
]);
const pickOf = (change: ChangeSetOp) => driverPickOf(change, providers);

describe('a driver pick in the changes review', () => {
  beforeAll(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));

  it('is a card for the driver, with the synced terms as numbers', () => {
    const [card] = buildChangeCards([op], [], new Map(), 'Asia/Makassar', pickOf);
    expect(card).toMatchObject({
      op: 'assign_provider',
      before: null,
      after: null,
      accepted: true,
    });
    expect(card?.driverPick?.terms).toEqual({
      price_minor: 70_000_000,
      currency: 'IDR',
      price_unit: 'day',
      included_hours: 10,
    });
  });

  it('is a row on his first day, with his days and terms', () => {
    const cards = buildChangeCards([op], [], new Map(), 'Asia/Makassar', pickOf);
    const [row] = changeRows({
      cards,
      days: [
        { dayNo: 3, date: '2026-10-14' },
        { dayNo: 4, date: '2026-10-15' },
      ],
      locale: 'en',
      placedReasons: null,
      stopName: () => null,
    });
    expect(row).toMatchObject({ key: MADE, dayTag: 'WED', title: '→ MADE', accepted: true });
    expect(row?.detail).toMatch(/^Wed 14, Thu 15 · .* a day · covers 10 hours$/u);
  });

  it('needs the crew’s vote, and only the author on a trip of one', () => {
    const base = { ops: [op], baseItems: [], costDeltaMinor: 0, inTrip: false, now: new Date(0) };
    expect(predictDecider({ ...base, crew: ['a', 'b', 'c'], authorId: 'a' })).toEqual({
      kind: 'vote',
      needed: 2,
      affected: ['a', 'b', 'c'],
    });
    expect(predictDecider({ ...base, crew: ['a'], authorId: 'a' })).toEqual({ kind: 'self' });
  });
});
