/**
 * Which mailbox messages are worth reading, decided from headers alone (sender, subject, date)
 * before any body is fetched: a known booking sender, or a confirmation-looking subject that names
 * a trip's destination, dated within 60 days either side of one of the owner's trips. Everything
 * else is never opened and nothing about it is stored.
 */
import { looksLikeConfirmation, supplierOfSender } from './booking-senders';

export const TRIP_WINDOW_DAYS = 60;

export interface TripWindow {
  /** `YYYY-MM-DD`, or null while the trip has no dates (then only its creation date bounds it). */
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** Destination words ("Bali", "Ubud", "Denpasar", "DPS"). */
  readonly keywords: readonly string[];
}

export interface MessageHeaders {
  /** The bare sender address. */
  readonly from: string;
  readonly subject: string;
  /** When the message was received. */
  readonly date: Date;
}

const DAY_MS = 86_400_000;

function inWindow(date: Date, trip: TripWindow): boolean {
  if (trip.startDate === null) return true;
  const start = Date.parse(`${trip.startDate}T00:00:00Z`) - TRIP_WINDOW_DAYS * DAY_MS;
  const end = Date.parse(`${trip.endDate ?? trip.startDate}T23:59:59Z`) + TRIP_WINDOW_DAYS * DAY_MS;
  return date.getTime() >= start && date.getTime() <= end;
}

export function shouldReadMessage(headers: MessageHeaders, trips: readonly TripWindow[]): boolean {
  const timely = trips.filter((trip) => inWindow(headers.date, trip));
  if (timely.length === 0) return false;
  if (supplierOfSender(headers.from) !== null) return true;
  if (!looksLikeConfirmation(headers.subject)) return false;
  const subject = headers.subject.toLowerCase();
  return timely.some((trip) =>
    trip.keywords.some((word) => word.length >= 3 && subject.includes(word.toLowerCase())),
  );
}
