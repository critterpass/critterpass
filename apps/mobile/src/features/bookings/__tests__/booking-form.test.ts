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
