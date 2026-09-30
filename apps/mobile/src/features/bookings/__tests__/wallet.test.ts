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
  stackOrder,
  toWalletBooking,
} from '../data/model';
import { offlineBookingIds, type OfflineEntry } from '../data/offline';
import { chipOf, flightView } from '../flight-card/flight-model';
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
