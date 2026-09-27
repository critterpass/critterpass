import { type ChangeSetOp } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  applyChangeSetOps,
  changeSetReview,
  type PlanItemState,
} from '../../src/feasibility/changeset-delta';

const CREW = ['u-alex', 'u-dev', 'u-jordan', 'u-maya', 'u-rin', 'u-winston'].map((uid) => ({
  uid,
  origin: 'SIN',
}));
const ids = {
  walk: '0195f000-0000-7000-8000-000000000001',
  museum: '0195f000-0000-7000-8000-000000000002',
  dinner: '0195f000-0000-7000-8000-000000000003',
  inari: '0195f000-0000-7000-8000-000000000004',
};

/** Wednesday, days 3–4 before the rain: a canal walk, a booked dinner, and Rin's must-do. */
const ITEMS: readonly PlanItemState[] = [
  {
    stable_id: ids.walk,
    day_no: 3,
    starts_at: '2027-04-07T14:00:00+09:00',
    ends_at: '2027-04-07T16:00:00+09:00',
    is_outdoor: true,
    cost_model: 'per_person',
    amount_minor: 0,
    currency: 'USD',
  },
  {
    stable_id: ids.dinner,
    day_no: 3,
    starts_at: '2027-04-07T19:00:00+09:00',
    ends_at: '2027-04-07T21:00:00+09:00',
    booking_id: '0195f000-0000-7000-8000-0000000000b1',
    cost_model: 'group',
    amount_minor: 36_000,
    currency: 'USD',
  },
  {
    stable_id: ids.inari,
    day_no: 4,
    starts_at: '2027-04-08T06:00:00+09:00',
    ends_at: '2027-04-08T08:00:00+09:00',
    must_do_id: '0195f000-0000-7000-8000-0000000000d1',
  },
];

/** The rain ChangeSet: swap the walk for the railway museum ($22 each), push dinner to 19:30. */
const RAIN_OPS: ChangeSetOp[] = [
  { op: 'remove', target: ids.walk, reason: 'rain', affected_user_ids: [], booking_impact: false },
  {
    op: 'add',
    target: ids.museum,
    after: {
      day_no: 3,
      starts_at: '2027-04-07T14:00:00+09:00',
      ends_at: '2027-04-07T16:00:00+09:00',
      cost_model: 'per_person',
      amount_minor: 2_200,
      currency: 'USD',
    },
    reason: 'indoors',
    affected_user_ids: [],
    booking_impact: false,
  },
  {
    op: 'retime',
    target: ids.dinner,
    after: { starts_at: '2027-04-07T19:30:00+09:00', ends_at: '2027-04-07T21:30:00+09:00' },
    reason: 'museum closes at 17:00, taxis are slow in rain',
    affected_user_ids: [],
    booking_impact: true,
  },
];

describe('change review golden (rain on Wednesday)', () => {
  it('+$22 EACH, 1 booking moved, 0 must-dos touched', () => {
    const review = changeSetReview({
      items: ITEMS,
      ops: RAIN_OPS,
      members: CREW,
      currency: 'USD',
      seenAt: '2027-04-06T00:00:00Z',
    });
    expect(review.each).toEqual({ amountMinor: 2_200n, currency: 'USD' });
    expect(review.bookingsMoved).toBe(1);
    expect(review.mustDosTouched).toBe(0);
    expect(review.perMember).toHaveLength(6);
  });

  it('counts a must-do touched and a booking removed; uneven deltas have no "each"', () => {
    const ops: ChangeSetOp[] = [
      {
        op: 'retime',
        target: ids.inari,
        after: { starts_at: '2027-04-08T07:00:00+09:00' },
        reason: 'x',
        affected_user_ids: [],
        booking_impact: false,
      },
      {
        op: 'remove',
        target: ids.dinner,
        reason: 'x',
        affected_user_ids: [],
        booking_impact: true,
      },
      {
        op: 'add',
        target: ids.museum,
        after: {
          cost_model: 'per_person',
          amount_minor: 1_000,
          currency: 'USD',
          attendee_ids: ['u-rin'],
        },
        reason: 'x',
        affected_user_ids: [],
        booking_impact: false,
      },
    ];
    const review = changeSetReview({
      items: ITEMS,
      ops,
      members: CREW,
      currency: 'USD',
      seenAt: '2027-04-06T00:00:00Z',
    });
    expect(review).toMatchObject({ each: null, bookingsMoved: 1, mustDosTouched: 1 });
  });

  it('applies add, remove, retime, move and swap by stable id', () => {
    const next = applyChangeSetOps(ITEMS, [
      ...RAIN_OPS,
      {
        op: 'move',
        target: ids.inari,
        after: { day_no: 5 },
        reason: 'x',
        affected_user_ids: [],
        booking_impact: false,
      },
    ]);
    expect(next.map((i) => i.stable_id)).toEqual([ids.dinner, ids.inari, ids.museum]);
    expect(next.find((i) => i.stable_id === ids.inari)?.day_no).toBe(5);
  });
});
