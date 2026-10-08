import { describe, expect, it } from '@jest/globals';

import {
  LAB_BOOKINGS,
  LAB_CANDIDATES,
  LAB_FLIGHT,
  LAB_MEMBERS,
  LAB_NOW,
  LAB_SEGMENTS,
  LAB_UID,
  labBooking,
  labSegment,
} from '../dev/lab-fixtures';
import {
  nightsOf,
  parseIdList,
  soonestRelevant,
  splitWallet,
  withoutDeleted,
  stackOrder,
  toWalletBooking,
} from '../data/model';
import { offlineBookingIds, type OfflineEntry } from '../data/offline';
import { pendingAdds } from '../data/pending-adds';
import {
  awaitsBoarding,
  chipOf,
  flightView,
  needsAttention,
  type FlightChip,
} from '../flight-card/flight-model';
import { currencyDigits, price } from '../format';
import { gateChanged } from '../flight-card/gate-memory';
import { bannerOf } from '../stack/banner';

const wallet = LAB_BOOKINGS.map((row) => toWalletBooking(row, LAB_SEGMENTS, LAB_UID));

describe('wallet stack', () => {
  it('opens the soonest booking at the front and keeps the rest in start order', () => {
    const { upcoming } = splitWallet(wallet, LAB_NOW);
    expect(upcoming.map((booking) => booking.id)).toEqual([
      'b-flight',
      'b-villa',
      'b-trek',
      'b-boat',
    ]);
    const open = soonestRelevant(upcoming, LAB_NOW);
    expect(open).toBe('b-flight');
    const order = stackOrder(upcoming, 'b-trek');
    expect(order.open?.id).toBe('b-trek');
    expect(order.closed.map((booking) => booking.id)).toEqual(['b-flight', 'b-villa', 'b-boat']);
  });

  it('prefers the booking under way over the next one', () => {
    const during = Date.parse('2026-10-13T10:00:00+08:00');
    const { upcoming } = splitWallet(wallet, during);
    expect(soonestRelevant(upcoming, during)).toBe('b-villa');
  });

  it('archives what ended over six hours ago and anything cancelled', () => {
    const after = Date.parse('2026-10-15T08:00:00+08:00');
    const cancelled = toWalletBooking(
      labBooking('b-x', 'transfer', 'Transfer', '2026-10-20T10:00:00+08:00', {
        status: 'cancelled',
      }),
      [],
      LAB_UID,
    );
    const { upcoming, past } = splitWallet([...wallet, cancelled], after);
    expect(upcoming.map((booking) => booking.id)).toEqual(['b-villa', 'b-trek', 'b-boat']);
    expect(past.map((booking) => booking.id)).toEqual(['b-x', 'b-flight']);
  });

  it('counts a stay in nights and reads traveller ids in either array form', () => {
    expect(
      nightsOf({ startsAt: '2026-10-12T15:00:00+08:00', endsAt: '2026-10-17T11:00:00+08:00' }),
    ).toBe(5);
    expect(parseIdList('["a","b"]')).toEqual(['a', 'b']);
    expect(parseIdList('{a,"b"}')).toEqual(['a', 'b']);
    expect(parseIdList(null)).toEqual([]);
  });
});

describe('a booking added on this phone', () => {
  it('shows from the upload queue until its row syncs, with its flight leg', () => {
    const envelope = JSON.stringify({
      payload: {
        booking_id: 'b-new',
        trip_id: 't1',
        kind: 'flight',
        title: '9G 957 DAD → SGN',
        tz: 'Asia/Ho_Chi_Minh',
        starts_at: '2026-10-03T19:40:00+07:00',
        ends_at: '2026-10-03T21:05:00+07:00',
        segments: [
          {
            carrier: '9G',
            flight_no: '957',
            dep_airport: 'DAD',
            arr_airport: 'SGN',
            sched_dep_at: '2026-10-03T19:40:00+07:00',
            sched_arr_at: '2026-10-03T21:05:00+07:00',
          },
        ],
      },
    });
    const queued = [{ envelope }, { envelope: 'not json' }];
    const shown = pendingAdds(queued, 't1', 'me', new Set());
    expect(shown.bookings.map((row) => [row.id, row.type, row.owner_id])).toEqual([
      ['b-new', 'flight', 'me'],
    ]);
    const card = toWalletBooking(shown.bookings[0]!, shown.segments, 'me');
    expect(card.segments[0]).toMatchObject({
      dep_airport: 'DAD',
      sched_arr_at: '2026-10-03T21:05:00+07:00',
    });
    expect(pendingAdds(queued, 't1', 'me', new Set(['b-new'])).bookings).toEqual([]);
    expect(pendingAdds(queued, 'other-trip', 'me', new Set()).bookings).toEqual([]);
  });
});

describe('a deleted booking', () => {
  it('leaves the wallet while its delete is still queued, so it cannot be deleted twice', () => {
    const rows = [{ id: 'b-flight' }, { id: 'b-trek' }];
    expect(withoutDeleted(rows, [])).toBe(rows);
    expect(withoutDeleted(rows, [{ booking_id: 'b-trek' }, { booking_id: null }])).toEqual([
      { id: 'b-flight' },
    ]);
  });
});

describe('flight card', () => {
  const flight = toWalletBooking(LAB_FLIGHT, LAB_SEGMENTS, LAB_UID);

  it('names the crewmates on the same flight and reads seat and bag from the details', () => {
    const view = flightView(flight, LAB_SEGMENTS);
    expect(view).toMatchObject({
      number: 'SQ 938',
      from: 'SIN',
      to: 'DPS',
      chip: 'on_time',
      gate: 'B7',
      seat: '34A',
      bag: '23kg',
      source: { name: 'AeroAPI' },
    });
    expect(view?.coTravellerIds).toEqual(['u-maya', 'u-alex']);
  });

  it('shows the status the leg reports, delays from 15 minutes, and a gate change', () => {
    const leg = labSegment('s', LAB_UID, 'b');
    expect(chipOf({ ...leg, delay_min: 25 }, false)).toBe('delayed');
    expect(chipOf({ ...leg, delay_min: 10 }, false)).toBe('on_time');
    expect(chipOf(leg, true)).toBe('gate_change');
    expect(chipOf({ ...leg, status: 'boarding' }, true)).toBe('boarding');
    expect(chipOf({ ...leg, status: 'cancelled' }, false)).toBe('cancelled');
    expect(chipOf({ ...leg, status: 'scheduled', status_source: 'schedule' }, false)).toBe(
      'scheduled',
    );
  });

  it('keeps the printed departure beside a new one, and only then', () => {
    expect(flightView(flight, LAB_SEGMENTS)?.wasDepartingAt).toBeNull();
    const leg = flight.segments[0];
    if (leg === undefined) throw new Error('the lab flight has a leg');
    const moved = {
      ...leg,
      status: 'delayed',
      delay_min: 25,
      est_dep_at: '2026-10-12T09:30:00+08:00',
    };
    const view = flightView({ ...flight, segments: [moved] }, LAB_SEGMENTS);
    expect(view?.departsAt).toBe('2026-10-12T09:30:00+08:00');
    expect(view?.wasDepartingAt).toBe(leg.sched_dep_at);
  });

  it('marks the statuses a traveller must not miss and stops promising a boarding ping', () => {
    const urgent: readonly FlightChip[] = ['cancelled', 'diverted', 'delayed', 'gate_change'];
    const calm: readonly FlightChip[] = ['scheduled', 'on_time', 'boarding', 'departed', 'landed'];
    expect(urgent.every((chip) => needsAttention(chip))).toBe(true);
    expect(calm.some((chip) => needsAttention(chip))).toBe(false);
    expect(awaitsBoarding('delayed')).toBe(true);
    expect(awaitsBoarding('boarding')).toBe(false);
    expect(awaitsBoarding('cancelled')).toBe(false);
  });

  it('flags a gate that moved after it was first seen', () => {
    expect(gateChanged('leg-1', 'B7')).toBe(false);
    expect(gateChanged('leg-1', 'B7')).toBe(false);
    expect(gateChanged('leg-1', 'C2')).toBe(true);
    expect(gateChanged('leg-2', null)).toBe(false);
  });
});

describe('offline count', () => {
  const entry = (bookingId: string, extra: Partial<OfflineEntry> = {}): OfflineEntry => ({
    bookingId,
    version: 1,
    barcode: null,
    files: {},
    ...extra,
  });

  it('counts bookings whose documents and own barcode are on the phone at their version', () => {
    const attachments = [{ id: 'a1', booking_id: 'b-trek', media_key: 'k', kind: 'voucher' }];
    const entries = new Map<string, OfflineEntry>([
      ['b-flight', entry('b-flight', { barcode: { format: 'pdf417', payload: 'M1' } })],
      ['b-trek', entry('b-trek', { files: { a1: 'file:///a1' } })],
      ['b-boat', entry('b-boat', { version: 0 })],
      ['b-villa', entry('b-villa')],
    ]);
    expect([...offlineBookingIds(wallet, attachments, entries)].sort()).toEqual([
      'b-flight',
      'b-trek',
      'b-villa',
    ]);
    entries.set('b-flight', entry('b-flight'));
    expect(offlineBookingIds(wallet, attachments, entries).has('b-flight')).toBe(false);
  });
});

describe('import banner', () => {
  it('names whose inbox most finds came from, or none when they are all mine', () => {
    const names = new Map(LAB_MEMBERS.map((member) => [member.userId, member.name]));
    expect(bannerOf(LAB_CANDIDATES, LAB_UID, names)).toEqual({ count: 2, member: 'Alex' });
    expect(bannerOf(LAB_CANDIDATES.slice(1), LAB_UID, names)).toEqual({ count: 1, member: null });
    expect(bannerOf([], LAB_UID, names)).toBeNull();
  });
});

describe('booking prices', () => {
  it('prints the shared symbol and the currency own decimals, never the bare code', () => {
    expect(price('en', 22800, 'USD')).toBe('US$228.00');
    expect(price('en', 45_000_000, 'IDR')).toMatch(/^Rp\s?450,000$/u);
    expect(currencyDigits('JPY')).toBe(0);
  });

  it('still prints an amount for a currency the table lacks', () => {
    expect(price('en', 12_50, 'XXA')).toBe('XXA 12.5');
    expect(currencyDigits('XXA')).toBe(2);
  });
});
