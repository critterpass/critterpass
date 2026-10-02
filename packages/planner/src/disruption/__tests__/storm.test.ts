import { describe, expect, it } from 'vitest';

import { stormOptions, swapDayOps, type StormBooking, type StormInput } from '../index';

const A = '0190f0a0-0000-7000-8000-00000000000a';
const B = '0190f0a0-0000-7000-8000-00000000000b';
const none: StormBooking = {
  supplier: 'none',
  partner: null,
  priceMinor: null,
  currency: null,
  refundMinor: null,
  cancellable: null,
  seatsOnSwapDay: 'unknown',
  bookerId: null,
};
const input = (booking: StormBooking, swap = true): StormInput => ({
  title: 'the boat',
  day: '2026-10-16',
  dayLabel: 'Friday',
  swapDay: swap ? { day: '2026-10-17', label: 'Saturday' } : null,
  attendeeIds: [A, B],
  booking,
});
const byId = (options: ReturnType<typeof stormOptions>, id: string) =>
  options.find((option) => option.id === id);

describe('stormOptions', () => {
  it('offers SWAP first for an unbooked boat and prices nothing', () => {
    const options = stormOptions(input(none));
    expect(options.map((o) => [o.id, o.offered, o.recommended])).toEqual([
      ['swap', true, true],
      ['keep', true, false],
      ['skip', true, false],
    ]);
    expect(byId(options, 'swap')).toMatchObject({
      label: 'Swap Friday and Saturday',
      per_person_minor: 0,
    });
  });

  it('moves a Viator booking as a new booking the booker pays, net of a free cancel', () => {
    const viator: StormBooking = {
      ...none,
      supplier: 'viator',
      priceMinor: 180_000,
      currency: 'USD',
      refundMinor: 180_000,
      cancellable: true,
      seatsOnSwapDay: 'available',
      bookerId: A,
    };
    const options = stormOptions(input(viator));
    expect(byId(options, 'swap')).toMatchObject({
      offered: true,
      supplier: 'viator_rebook',
      per_person_minor: 0,
      note: 'The booker confirms and pays the new booking; the old one is cancelled after',
    });
    expect(byId(options, 'skip')).toMatchObject({
      per_person_minor: -90_000,
      note: 'Cancelled free',
    });
  });

  it("does not offer SWAP when Viator can't move the seats, and keeps when a cancel costs", () => {
    const options = stormOptions(
      input({
        ...none,
        supplier: 'viator',
        priceMinor: 180_000,
        currency: 'USD',
        refundMinor: 90_000,
        cancellable: true,
        seatsOnSwapDay: 'unavailable',
        bookerId: A,
      }),
    );
    expect(byId(options, 'swap')).toMatchObject({ offered: false, note: "Can't move the seats" });
    expect(byId(options, 'keep')?.recommended).toBe(true);
    expect(byId(options, 'skip')?.per_person_minor).toBe(-45_000);
  });

  it('sends an affiliate booking to the partner and offers no swap without a calm day', () => {
    const klook = { ...none, supplier: 'affiliate' as const, partner: 'Klook' };
    expect(byId(stormOptions(input(klook)), 'swap')).toMatchObject({
      supplier: 'partner_link',
      note: 'Change it on Klook',
    });
    const noCalm = stormOptions(input(none, false));
    expect(byId(noCalm, 'swap')?.offered).toBe(false);
    expect(byId(noCalm, 'skip')?.recommended).toBe(true);
  });
});

describe('swapDayOps', () => {
  it('moves each day to the other at the same local time, flagging booked items', () => {
    const ops = swapDayOps(
      {
        dayNo: 3,
        items: [
          {
            stableId: '0190f0a0-0000-7000-a000-000000000001',
            startsAt: new Date('2026-10-16T01:00:00Z'),
            endsAt: new Date('2026-10-16T05:00:00Z'),
            attendeeIds: [A, B],
            bookingId: '0190f0a0-0000-7000-c000-000000000001',
          },
        ],
      },
      {
        dayNo: 4,
        items: [
          {
            stableId: '0190f0a0-0000-7000-a000-000000000002',
            startsAt: new Date('2026-10-17T02:00:00Z'),
            endsAt: null,
            attendeeIds: [A],
            bookingId: null,
          },
        ],
      },
      1,
      'Rough seas on Friday',
    );
    expect(ops).toEqual([
      expect.objectContaining({
        op: 'move',
        after: {
          day_no: 4,
          starts_at: '2026-10-17T01:00:00.000Z',
          ends_at: '2026-10-17T05:00:00.000Z',
        },
        booking_impact: true,
      }),
      expect.objectContaining({
        op: 'move',
        after: { day_no: 3, starts_at: '2026-10-16T02:00:00.000Z' },
        booking_impact: false,
      }),
    ]);
  });
});
