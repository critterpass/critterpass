/**
 * Booking senders: the domains confirmation emails come from, which seller each one is, and the
 * words that mark a confirmation in a subject line. Used to name the supplier of a forward and,
 * for mailbox scans, to decide from headers alone which messages are worth reading at all.
 */
import type { BookingSupplier } from './kinds';

/** Sender domain → seller (subdomains match: `mail.agoda.com` is Agoda). */
export const BOOKING_SENDER_DOMAINS: Readonly<Record<string, BookingSupplier>> = {
  'agoda.com': 'agoda',
  'agoda-emails.com': 'agoda',
  'trip.com': 'trip_com',
  'ctrip.com': 'trip_com',
  'booking.com': 'booking',
  'viator.com': 'viator',
  'klook.com': 'klook',
  'getyourguide.com': 'gyg',
  'singaporeair.com': 'airline',
  'singaporeair.com.sg': 'airline',
  'flyscoot.com': 'airline',
  'airasia.com': 'airline',
  'jetstar.com': 'airline',
  'vietnamairlines.com': 'airline',
  'vietjetair.com': 'airline',
  'garuda-indonesia.com': 'airline',
  'lionair.co.id': 'airline',
  'thaiairways.com': 'airline',
  'malaysiaairlines.com': 'airline',
  'cathaypacific.com': 'airline',
  'jal.com': 'airline',
  'ana.co.jp': 'airline',
  'koreanair.com': 'airline',
  'philippineairlines.com': 'airline',
  'cebupacificair.com': 'airline',
  'qatarairways.com': 'airline',
  'emirates.com': 'airline',
  'bookaway.com': 'other',
  '12go.asia': 'other',
  'hostelworld.com': 'other',
  'airbnb.com': 'other',
  'expedia.com': 'other',
  'hotels.com': 'other',
  'traveloka.com': 'other',
  'tiket.com': 'other',
};

/** The seller a sender address belongs to, or null for a domain we do not know. */
export function supplierOfSender(address: string): BookingSupplier | null {
  const domain = address.split('@')[1]?.toLowerCase();
  if (domain === undefined) return null;
  for (const [known, supplier] of Object.entries(BOOKING_SENDER_DOMAINS)) {
    if (domain === known || domain.endsWith(`.${known}`)) return supplier;
  }
  return null;
}

/** Subject words of a confirmation (English plus the languages the app ships). */
export const CONFIRMATION_SUBJECT_WORDS = [
  'confirm',
  'booking',
  'reservation',
  'itinerary',
  'e-ticket',
  'eticket',
  'boarding pass',
  'receipt',
  'voucher',
  'xác nhận',
  'đặt phòng',
  'konfirmasi',
  'pemesanan',
  '予約',
  '確認',
  '예약',
  'ยืนยัน',
  'การจอง',
] as const;

export function looksLikeConfirmation(subject: string): boolean {
  const lower = subject.toLowerCase();
  return CONFIRMATION_SUBJECT_WORDS.some((word) => lower.includes(word));
}
