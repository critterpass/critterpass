import { describe, expect, it } from '@jest/globals';

import { toWalletBooking } from '../data/model';
import { LAB_BOOKINGS, LAB_FLIGHT, LAB_SEGMENTS, LAB_UID } from '../dev/lab-fixtures';
import {
  draftOf,
  emptyDraft,
  problemsOf,
  toAddPayload,
  toEditPayload,
  wallOf,
  zonedIso,
  zoneName,
} from '../detail/form-model';

const BALI = 'Asia/Makassar';

describe('booking form times', () => {
  it('reads the wall clock in the booking zone, across a daylight-saving change', () => {
    expect(zonedIso('2026-10-12', '09:05', BALI)).toBe('2026-10-12T09:05:00+08:00');
    expect(zonedIso('2026-03-29', '10:00', 'Europe/Berlin')).toBe('2026-03-29T10:00:00+02:00');
    expect(zonedIso('2026-03-28', '10:00', 'Europe/Berlin')).toBe('2026-03-28T10:00:00+01:00');
    expect(zonedIso('2026-02-30', '10:00', BALI)).toBeNull();
    expect(zonedIso('12/10/2026', '10:00', BALI)).toBeNull();
    expect(wallOf('2026-10-12T01:05:00Z', BALI)).toEqual({ date: '2026-10-12', time: '09:05' });
  });

  it('names the zone the form reads its times in', () => {
    const at = Date.parse('2026-10-02T00:00:00Z');
    expect(zoneName('Asia/Ho_Chi_Minh', at)).toEqual({ city: 'Ho Chi Minh', offset: 'GMT+7' });
    expect(zoneName('Asia/Kolkata', at)).toEqual({ city: 'Kolkata', offset: 'GMT+5:30' });
    expect(zoneName('America/New_York', at)).toEqual({ city: 'New York', offset: 'GMT-4' });
  });
});

describe('adding by hand', () => {
  it('needs a flight number and airports, then sends one leg in the booking zone', () => {
    const draft = { ...emptyDraft('flight'), date: '2026-10-12', time: '9:05' };
    expect(problemsOf(draft, BALI)).toEqual(['flight', 'airports']);
    const payload = toAddPayload(
      { ...draft, flight: 'sq938', from: 'sin', to: 'dps', seat: '34a' },
      { bookingId: 'b1', tripId: 't1' },
      BALI,
    );
    expect(payload).toMatchObject({
      booking_id: 'b1',
      trip_id: 't1',
      kind: 'flight',
      title: 'SQ938 SIN → DPS',
      starts_at: '2026-10-12T09:05:00+08:00',
      details: { seat: '34A' },
      segments: [
        {
          carrier: 'SQ',
          flight_no: '938',
          dep_airport: 'SIN',
          arr_airport: 'DPS',
          sched_dep_at: '2026-10-12T09:05:00+08:00',
        },
      ],
    });
  });

  it('sends when a flight lands, on the next day for an overnight flight', () => {
    const flight = {
      ...emptyDraft('flight'),
      date: '2026-10-02',
      time: '07:05',
      arrive: '08:30',
      flight: '9G 956',
      from: 'SGN',
      to: 'DAD',
    };
    const ids = { bookingId: 'b3', tripId: 't1' };
    const saigon = 'Asia/Ho_Chi_Minh';
    expect(toAddPayload(flight, ids, saigon)).toMatchObject({
      starts_at: '2026-10-02T07:05:00+07:00',
      ends_at: '2026-10-02T08:30:00+07:00',
      segments: [
        { sched_dep_at: '2026-10-02T07:05:00+07:00', sched_arr_at: '2026-10-02T08:30:00+07:00' },
      ],
    });
    const overnight = toAddPayload({ ...flight, time: '23:40', arrive: '01:10' }, ids, saigon);
    expect(overnight?.segments?.[0]?.sched_arr_at).toBe('2026-10-03T01:10:00+07:00');
    expect(problemsOf({ ...flight, arrive: '8.3' }, saigon)).toEqual(['arrive']);
    const untimed = toAddPayload({ ...flight, arrive: '' }, ids, saigon);
    expect(untimed?.ends_at).toBeUndefined();
    expect(untimed?.segments?.[0]).not.toHaveProperty('sched_arr_at');
  });

  it('reads the landing on the arrival airport clock, whatever zone the trip is in', () => {
    const ids = { bookingId: 'b4', tripId: 't1' };
    // DPS 12:55 (Bali) to SIN 15:35 (Singapore): same offset, one hour gap read as shown.
    const home = {
      ...emptyDraft('flight'),
      date: '2026-10-19',
      time: '12:55',
      arrive: '15:35',
      flight: 'SQ 943',
      from: 'DPS',
      to: 'SIN',
    };
    expect(toAddPayload(home, ids, 'Asia/Ho_Chi_Minh')).toMatchObject({
      tz: 'Asia/Makassar',
      starts_at: '2026-10-19T12:55:00+08:00',
      ends_at: '2026-10-19T15:35:00+08:00',
    });
    // Saigon 23:50 to Tokyo 07:30 next morning: two hours ahead, so 5h40 in the air, not 7h40.
    const east = {
      ...home,
      flight: 'VN 300',
      from: 'SGN',
      to: 'NRT',
      time: '23:50',
      arrive: '07:30',
    };
    expect(toAddPayload(east, ids, 'Asia/Ho_Chi_Minh')?.segments?.[0]).toMatchObject({
      sched_dep_at: '2026-10-19T23:50:00+07:00',
      sched_arr_at: '2026-10-20T07:30:00+09:00',
    });
    // Sydney 10:00 to Los Angeles 06:30 the same calendar day, across the date line.
    const dateLine = {
      ...home,
      flight: 'QF 11',
      from: 'SYD',
      to: 'LAX',
      time: '10:00',
      arrive: '06:30',
    };
    expect(toAddPayload(dateLine, ids, 'Australia/Sydney')?.segments?.[0]).toMatchObject({
      sched_dep_at: '2026-10-19T10:00:00+11:00',
      sched_arr_at: '2026-10-19T06:30:00-07:00',
    });
  });

  it('shows a saved flight on each airport clock again', () => {
    const flight = toWalletBooking(LAB_FLIGHT, LAB_SEGMENTS, LAB_UID);
    const draft = draftOf(flight, 'Europe/London');
    expect(draftOf(flight, BALI)).toEqual(draft);
  });

  it('adds a stay with its check-out day and no time', () => {
    const payload = toAddPayload(
      { ...emptyDraft('stay', 'Villa Kayu Manis'), date: '2026-10-12', endDate: '2026-10-17' },
      { bookingId: 'b2', tripId: 't1' },
      BALI,
    );
    expect(payload).toMatchObject({
      kind: 'stay',
      starts_at: '2026-10-12T00:00:00+08:00',
      ends_at: '2026-10-17T00:00:00+08:00',
    });
    expect(payload?.segments).toBeUndefined();
  });
});

describe('editing', () => {
  it('sends only what changed, clearing emptied fields, against the booking version', () => {
    const trek = toWalletBooking(LAB_BOOKINGS[1]!, [], LAB_UID);
    const before = draftOf(trek, BALI);
    expect(before).toMatchObject({ date: '2026-10-15', time: '03:30', ref: 'KL-44821' });
    expect(toEditPayload(before, trek, BALI)).toBeNull();
    expect(toEditPayload({ ...before, ref: '', time: '04:00' }, trek, BALI)).toEqual({
      booking_id: 'b-trek',
      base_version: 1,
      patch: { starts_at: '2026-10-15T04:00:00+08:00', clear: ['supplier_ref'] },
    });
  });

  it('keeps a flight seat change inside the details it already had', () => {
    const flight = toWalletBooking(LAB_FLIGHT, LAB_SEGMENTS, LAB_UID);
    const before = draftOf(flight, BALI);
    expect(before).toMatchObject({ flight: 'SQ 938', from: 'SIN', to: 'DPS', seat: '34A' });
    expect(toEditPayload({ ...before, seat: '12C' }, flight, BALI)?.patch.details).toEqual({
      seat: '12C',
      baggage: '23kg',
      cabin: 'Economy',
    });
  });
});
