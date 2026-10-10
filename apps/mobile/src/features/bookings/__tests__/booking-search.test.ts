import { describe, expect, it } from '@jest/globals';

import { toWalletBooking } from '../data/model';
import { LAB_BOOKINGS, LAB_SEGMENTS, LAB_UID } from '../dev/lab-fixtures';
import { searchBookings } from '../stack/booking-search';

const bookings = LAB_BOOKINGS.map((row) => toWalletBooking(row, LAB_SEGMENTS, LAB_UID));
const ids = (query: string) => searchBookings(bookings, query).map((booking) => booking.id);

describe('searching bookings', () => {
  it('finds by title, place and reference, ignoring case and order of words', () => {
    expect(ids('villa')).toEqual(['b-trek', 'b-villa']);
    expect(ids('ubud kayu')).toEqual(['b-villa']);
    expect(ids('kl-44821')).toEqual(['b-trek']);
    expect(ids('sanur')).toEqual(['b-boat']);
  });

  it('finds a flight by its legs', () => {
    expect(ids('dps')).toContain('b-flight');
    expect(ids('k7pq2z')).toEqual(['b-flight']);
  });

  it('keeps everything for an empty query and nothing for a miss', () => {
    expect(ids('  ')).toHaveLength(bookings.length);
    expect(ids('lisbon')).toEqual([]);
  });
});
