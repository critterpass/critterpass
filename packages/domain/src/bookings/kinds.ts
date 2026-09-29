/**
 * The trip wallet's vocabulary (docs/data-model.md §3.7): booking kinds, where a booking came from,
 * who sold it, and the states of imports, flights and mailbox connections. The migrations' CHECK
 * lists are copied from these tuples.
 */
import { z } from 'zod';

/** Card types of the wallet stack; `boat` (fast boats, ferries) and `car` (car hire) have their own card. */
export const BOOKING_KINDS = [
  'flight',
  'stay',
  'activity',
  'boat',
  'transfer',
  'rail',
  'car',
  'other',
] as const;
export const bookingKindSchema = z.enum(BOOKING_KINDS);
export type BookingKind = z.infer<typeof bookingKindSchema>;

export const BOOKING_SOURCES = ['forward', 'mailbox', 'scan', 'paste', 'viator', 'manual'] as const;
export const bookingSourceSchema = z.enum(BOOKING_SOURCES);
export type BookingSource = z.infer<typeof bookingSourceSchema>;

export const BOOKING_SUPPLIERS = [
  'agoda',
  'trip_com',
  'booking',
  'viator',
  'klook',
  'gyg',
  'airline',
  'other',
] as const;
export const bookingSupplierSchema = z.enum(BOOKING_SUPPLIERS);
export type BookingSupplier = z.infer<typeof bookingSupplierSchema>;

export const BOOKING_STATUSES = ['booked', 'cancelled', 'pending_operator'] as const;
export const bookingStatusSchema = z.enum(BOOKING_STATUSES);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const BOOKING_VISIBILITIES = ['crew', 'personal'] as const;
export const bookingVisibilitySchema = z.enum(BOOKING_VISIBILITIES);
export type BookingVisibility = z.infer<typeof bookingVisibilitySchema>;

export const BOOKING_ATTACHMENT_KINDS = ['pdf', 'voucher', 'image', 'boarding_pass'] as const;
export const bookingAttachmentKindSchema = z.enum(BOOKING_ATTACHMENT_KINDS);
export type BookingAttachmentKind = z.infer<typeof bookingAttachmentKindSchema>;

export const BARCODE_FORMATS = ['pdf417', 'aztec', 'qr', 'code128'] as const;
export const barcodeFormatSchema = z.enum(BARCODE_FORMATS);
export type BarcodeFormat = z.infer<typeof barcodeFormatSchema>;

export const IMPORT_SOURCES = ['forward', 'mailbox', 'scan', 'paste'] as const;
export const importSourceSchema = z.enum(IMPORT_SOURCES);
export type ImportSource = z.infer<typeof importSourceSchema>;

/**
 * `parsing` while the job reads it, `pending` for ADD/IGNORE, `failed` when nothing could be read
 * ("add it by hand"), `duplicate` when the wallet or another candidate already holds it.
 */
export const IMPORT_CANDIDATE_STATUSES = [
  'parsing',
  'pending',
  'accepted',
  'rejected',
  'duplicate',
  'failed',
] as const;
export const importCandidateStatusSchema = z.enum(IMPORT_CANDIDATE_STATUSES);
export type ImportCandidateStatus = z.infer<typeof importCandidateStatusSchema>;

export const FLIGHT_STATUSES = [
  'scheduled',
  'on_time',
  'delayed',
  'boarding',
  'departed',
  'landed',
  'cancelled',
  'diverted',
] as const;
export const flightStatusSchema = z.enum(FLIGHT_STATUSES);
export type FlightStatus = z.infer<typeof flightStatusSchema>;

/** Who last said what the flight is doing; `schedule` = only the booked times are known. */
export const FLIGHT_STATUS_SOURCES = ['aerodatabox', 'flightaware', 'manual', 'schedule'] as const;
export const flightStatusSourceSchema = z.enum(FLIGHT_STATUS_SOURCES);
export type FlightStatusSource = z.infer<typeof flightStatusSourceSchema>;

export const LA_PHASES = ['check_in', 'boarding', 'departed', 'landed', 'pickup'] as const;
export const laPhaseSchema = z.enum(LA_PHASES);
export type LaPhase = z.infer<typeof laPhaseSchema>;

export const FLIGHT_WATCH_PROVIDERS = ['flightaware', 'aerodatabox'] as const;
export type FlightWatchProvider = (typeof FLIGHT_WATCH_PROVIDERS)[number];

export const MAILBOX_PROVIDERS = ['gmail', 'microsoft'] as const;
export const mailboxProviderSchema = z.enum(MAILBOX_PROVIDERS);
export type MailboxProvider = z.infer<typeof mailboxProviderSchema>;

export const MAILBOX_STATUSES = ['active', 'paused', 'revoked', 'error'] as const;
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

export const INBOUND_EMAIL_STATUSES = ['accepted', 'quarantined', 'parsed', 'failed'] as const;
export type InboundEmailStatus = (typeof INBOUND_EMAIL_STATUSES)[number];

/** Kinds that are one person's by default: a flight is booked per traveller. */
const PERSONAL_BY_DEFAULT: ReadonlySet<BookingKind> = new Set(['flight']);

/**
 * Stays, activities, boats and transfers for two or more travellers are the crew's; a flight, or
 * anything for one traveller, stays personal until its owner shares it.
 */
export function defaultBookingVisibility(
  kind: BookingKind,
  travellerCount: number,
): BookingVisibility {
  if (PERSONAL_BY_DEFAULT.has(kind)) return 'personal';
  return travellerCount >= 2 ? 'crew' : 'personal';
}
