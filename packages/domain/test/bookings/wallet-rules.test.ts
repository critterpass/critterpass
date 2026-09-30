import { describe, expect, it } from 'vitest';

import { addBookingPayloadSchema } from '../../src/bookings/booking-schema';
import { bookedNotYetExpensed } from '../../src/bookings/booked-cost-provider';
import { deadlineReminderAt } from '../../src/bookings/deadline';
import { defaultBookingVisibility } from '../../src/bookings/kinds';
import { boardingTime } from '../../src/flights/boarding';

const at = (iso: string) => new Date(iso);

describe('free-cancellation reminders', () => {
  it('fires a day before the deadline', () => {
    expect(deadlineReminderAt(at('2026-10-05T16:00:00Z'), at('2026-09-30T00:00:00Z'))).toEqual(
      at('2026-10-04T16:00:00Z'),
    );
  });

  it('fires at once when less than a day is left, and never after the deadline', () => {
    const now = at('2026-10-05T01:00:00Z');
    expect(deadlineReminderAt(at('2026-10-05T16:00:00Z'), now)).toEqual(now);
    expect(deadlineReminderAt(at('2026-10-05T00:59:00Z'), now)).toBeNull();
  });
});

describe('booked costs for the forecast', () => {
  const row = {
    kind: 'stay' as const,
    status: 'booked',
    deleted: false,
    priceMinor: 90_000n,
    currency: 'USD',
    startsAt: null,
  };

  it('counts live priced bookings until an expense points at them', () => {
    const costs = bookedNotYetExpensed(
      [
        { ...row, id: 'a' },
        { ...row, id: 'b' },
        { ...row, id: 'c', status: 'cancelled' },
        { ...row, id: 'd', deleted: true },
        { ...row, id: 'e', priceMinor: null, currency: null },
      ],
      new Set(['b']),
    );
    expect(costs.map((cost) => cost.bookingId)).toEqual(['a']);
  });
});

describe('default visibility', () => {
  it('shares stays and activities for two or more travellers, never flights', () => {
    expect(defaultBookingVisibility('stay', 3)).toBe('crew');
    expect(defaultBookingVisibility('activity', 1)).toBe('personal');
    expect(defaultBookingVisibility('flight', 6)).toBe('personal');
  });
});

describe('boarding estimates', () => {
  it('uses the announced time, else departure less 40 minutes labelled as an estimate', () => {
    const dep = at('2026-10-12T01:40:00Z');
    expect(boardingTime({ schedDepAt: dep })).toEqual({
      at: at('2026-10-12T01:00:00Z'),
      estimated: true,
    });
    expect(boardingTime({ schedDepAt: dep, estDepAt: at('2026-10-12T02:40:00Z') }).at).toEqual(
      at('2026-10-12T02:00:00Z'),
    );
    expect(boardingTime({ schedDepAt: dep, announcedAt: at('2026-10-12T00:55:00Z') })).toEqual({
      at: at('2026-10-12T00:55:00Z'),
      estimated: false,
    });
  });
});

describe('add_booking payload', () => {
  const base = {
    booking_id: '0192f000-0000-7000-8000-000000000001',
    trip_id: '0192f000-0000-7000-8000-000000000002',
    title: 'Villa',
  };

  it('requires legs on a flight and nowhere else, and a price for a split', () => {
    expect(addBookingPayloadSchema.safeParse({ ...base, kind: 'flight' }).success).toBe(false);
    expect(
      addBookingPayloadSchema.safeParse({
        ...base,
        kind: 'stay',
        segments: [
          {
            carrier: 'SQ',
            flight_no: '938',
            dep_airport: 'SIN',
            arr_airport: 'DPS',
            sched_dep_at: '2026-10-12T01:40:00Z',
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      addBookingPayloadSchema.safeParse({
        ...base,
        kind: 'stay',
        split: { expense_id: '0192f000-0000-7000-8000-000000000003' },
      }).success,
    ).toBe(false);
    expect(addBookingPayloadSchema.safeParse({ ...base, kind: 'stay' }).success).toBe(true);
  });
});
