/**
 * Searching the wallet and past bookings on this phone (synced rows, works offline): every word
 * typed must appear in the booking's title, place, reference or, for a flight, a leg's carrier,
 * flight number or airports. Accents and case are ignored ("da lat" finds "Đà Lạt").
 */
import { foldForSearch } from '@cp/domain';

import type { WalletBooking } from '../data/model';

function haystack(booking: WalletBooking): string {
  const legs = booking.segments.flatMap((leg) => [
    leg.carrier,
    leg.flight_no,
    `${leg.carrier}${leg.flight_no}`,
    leg.dep_airport,
    leg.arr_airport,
  ]);
  return foldForSearch(
    [booking.title, booking.location ?? '', booking.supplierRef ?? '', ...legs].join(' '),
  );
}

export function searchBookings(
  bookings: readonly WalletBooking[],
  query: string,
): readonly WalletBooking[] {
  const words = foldForSearch(query).split(/\s+/u).filter(Boolean);
  if (words.length === 0) return bookings;
  return bookings.filter((booking) => {
    const text = haystack(booking);
    return words.every((word) => text.includes(word));
  });
}
