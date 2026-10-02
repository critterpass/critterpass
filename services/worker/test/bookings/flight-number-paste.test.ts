/**
 * Reading a paste that is only a flight number: the number in its usual spellings, an optional
 * date in the usual shapes (the year inferred from the trip), and anything longer left to the
 * confirmation reader.
 */
import { describe, expect, it } from 'vitest';

import { lookupWindow, readPastedFlight } from '../../src/jobs/bookings/flight-number-paste';

const REF = '2026-10-02';

describe('a pasted flight number', () => {
  it('reads the number with or without a space, and with a date before or after', () => {
    expect(readPastedFlight('9G 956', REF)).toEqual({ carrier: '9G', number: '956', date: null });
    expect(readPastedFlight('  vj0123 ', REF)).toEqual({
      carrier: 'VJ',
      number: '123',
      date: null,
    });
    expect(readPastedFlight('9G956 2 Oct', REF)?.date).toBe('2026-10-02');
    expect(readPastedFlight('Oct 4 9G 957', REF)).toEqual({
      carrier: '9G',
      number: '957',
      date: '2026-10-04',
    });
    expect(readPastedFlight('VN 123 4/10', REF)?.date).toBe('2026-10-04');
    expect(readPastedFlight('VN 123 ngày 4 tháng 10', REF)?.date).toBe('2026-10-04');
    expect(readPastedFlight('SQ938 2027-01-05', REF)?.date).toBe('2027-01-05');
  });

  it('puts a date long before the trip in the next year', () => {
    expect(readPastedFlight('SQ 938 5 Jan', REF)?.date).toBe('2027-01-05');
  });

  it('leaves anything else to the confirmation reader', () => {
    expect(readPastedFlight('Booking ref ABC123 for 2 adults', REF)).toBeNull();
    expect(readPastedFlight('9G 956 tomorrow morning', REF)).toBeNull();
    expect(readPastedFlight('956', REF)).toBeNull();
    expect(readPastedFlight('9G 956 31/02', REF)).toBeNull();
  });

  it('looks on the typed day, else the trip days when there are at most seven', () => {
    const bare = { carrier: '9G', number: '956', date: null };
    expect(lookupWindow({ ...bare, date: '2026-10-03' }, { start: null, end: null })).toEqual({
      from: '2026-10-03',
      to: '2026-10-03',
    });
    expect(lookupWindow(bare, { start: '2026-10-02', end: '2026-10-04' })).toEqual({
      from: '2026-10-02',
      to: '2026-10-04',
    });
    expect(lookupWindow(bare, { start: '2026-10-02', end: '2026-10-12' })).toBeNull();
    expect(lookupWindow(bare, { start: null, end: null })).toBeNull();
  });
});
