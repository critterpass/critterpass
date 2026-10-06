/**
 * The change card names the change: one change by a person reads as a sentence with the place, the
 * day and the time; several changes, or the guide's own, keep the counted headline.
 */
// The drivers area's index also draws its cards (Skia, the device database), which do not exist
// under Jest: these tests read its change card model, the real one, straight from its module.
jest.mock('@/features/drivers', () =>
  jest.requireActual<object>('../../../drivers/pick/pick-card'),
);
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';

import { changeTitle } from '../chat-card-title';
import type { ChangeCard } from '../model/review-model';

const card = (over: Partial<ChangeCard>): ChangeCard => ({
  target: 's-1',
  op: 'add',
  before: null,
  after: { dayNo: 3, time: '07:00', label: 'Bà Nà Hills' },
  movesDay: false,
  reason: 'manual',
  people: [],
  accepted: true,
  bookingImpact: false,
  mustDo: false,
  driverPick: null,
  ...over,
});
const dayLabel = (dayNo: number) => (dayNo === 3 ? 'Wed' : null);
const by = (cards: readonly ChangeCard[], mine = false, author: string | null = 'Minh') =>
  changeTitle({ cards, trigger: 'manual', author, mine, dayLabel });

describe('the change card’s title', () => {
  beforeAll(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));

  it('says who wants what, where and when', () => {
    expect(by([card({})])).toBe('Minh wants to add Bà Nà Hills, Wed 07:00');
    expect(by([card({})], true)).toBe('You want to add Bà Nà Hills, Wed 07:00');
    const drop = card({
      op: 'remove',
      after: null,
      before: { dayNo: 3, time: '07:00', label: 'Chùa Mỹ Khê' },
    });
    expect(by([drop])).toBe('Minh wants to drop Chùa Mỹ Khê');
    expect(by([card({ op: 'retime' })])).toBe('Minh wants to move Bà Nà Hills to Wed 07:00');
  });

  it('leaves out a day the trip has no date for', () => {
    expect(by([card({ after: { dayNo: 9, time: '07:00', label: 'Bà Nà Hills' } })])).toBe(
      'Minh wants to add Bà Nà Hills, 07:00',
    );
  });

  it('counts instead when there are several changes, only one is kept, or the guide wrote it', () => {
    expect(by([card({}), card({ target: 's-2' })])).toBe('2 changes to the plan');
    expect(by([card({}), card({ target: 's-2', accepted: false })])).toBe(
      'Minh wants to add Bà Nà Hills, Wed 07:00',
    );
    expect(by([card({})], false, null)).toBe('1 change to the plan');
  });

  it('names the driver the crew is asked to pick', () => {
    const pick = card({
      op: 'assign_provider',
      after: null,
      reason: 'driver_pick',
      driverPick: {
        name: 'Made',
        days: [{ date: '2026-10-14', window_start: null, window_end: null, pickup: null }],
        terms: null,
      },
    });
    expect(by([pick])).toBe('Minh wants Made to drive');
    expect(by([pick], true)).toBe('You want Made to drive');
    // Among other changes it is one of the counted changes.
    expect(by([pick, card({})])).toBe(by([card({}), card({ target: 's-2' })]));
  });
});
