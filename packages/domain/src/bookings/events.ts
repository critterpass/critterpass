/**
 * Bookings, imports, flight and policy-vault domain events (docs/api-contracts.md §4.10) and the
 * realtime hints on `crew_bookings:{crew_id}`. Payloads carry ids and enum values only: never a
 * confirmation code, a sender, a barcode or a policy number.
 */
import { z } from 'zod';

import {
  bookingKindSchema,
  bookingSourceSchema,
  bookingVisibilitySchema,
  flightStatusSchema,
  importCandidateStatusSchema,
  importSourceSchema,
  mailboxProviderSchema,
} from './kinds';

export const BOOKING_EVENT_TYPES = [
  'booking.added',
  'booking.edited',
  'booking.deleted',
  'booking.visibility_changed',
  'booking.deadline_due',
  'import.requested',
  'import.candidate_created',
  'import.resolved',
  'import.quarantined',
  'import.sender_linked',
  'crew.inbound_rotated',
  'mailbox.connected',
  'mailbox.disconnected',
  'flight.watch_started',
  'flight.status_changed',
  'flight.boarding_open',
  'flight.landed',
  'insurance.saved',
  'insurance.deleted',
  'insurance.shared',
] as const;
export type BookingEventType = (typeof BOOKING_EVENT_TYPES)[number];

/** What moved on a flight: the push (N-14) goes out for delay, gate, cancel and divert. */
export const FLIGHT_CHANGES = [
  'delay',
  'gate',
  'cancelled',
  'diverted',
  'departed',
  'landed',
  'schedule',
] as const;
export const flightChangeSchema = z.enum(FLIGHT_CHANGES);
export type FlightChange = z.infer<typeof flightChangeSchema>;

const booking = z.object({ trip_id: z.uuid(), booking_id: z.uuid() });
const segment = booking.extend({ segment_id: z.uuid() });
const candidate = z.object({ candidate_id: z.uuid(), user_id: z.uuid() });

export const BOOKING_EVENT_PAYLOADS = {
  'booking.added': booking.extend({ kind: bookingKindSchema, source: bookingSourceSchema }),
  'booking.edited': booking.extend({ version: z.int().positive() }),
  'booking.deleted': booking,
  'booking.visibility_changed': booking.extend({ visibility: bookingVisibilitySchema }),
  // The free-cancellation deadline is a day away (the traveller who owns the booking hears it).
  'booking.deadline_due': booking.extend({ user_id: z.uuid() }),
  'import.requested': candidate.extend({
    trip_id: z.uuid().nullable(),
    source: importSourceSchema,
  }),
  'import.candidate_created': candidate.extend({
    crew_id: z.uuid().nullable(),
    trip_id: z.uuid().nullable(),
    source: importSourceSchema,
    status: importCandidateStatusSchema,
  }),
  'import.resolved': candidate.extend({
    action: z.enum(['add', 'ignore']),
    booking_id: z.uuid().nullable(),
    by_uid: z.uuid(),
  }),
  // Mail from a sender the crew's allow-list does not know waits for a member to link it.
  'import.quarantined': z.object({ crew_id: z.uuid(), inbound_email_id: z.uuid() }),
  'import.sender_linked': z.object({ crew_id: z.uuid(), user_id: z.uuid() }),
  'crew.inbound_rotated': z.object({ crew_id: z.uuid() }),
  'mailbox.connected': z.object({
    user_id: z.uuid(),
    connection_id: z.uuid(),
    provider: mailboxProviderSchema,
  }),
  'mailbox.disconnected': z.object({
    user_id: z.uuid(),
    connection_id: z.uuid(),
    provider: mailboxProviderSchema,
    revoked: z.boolean(),
  }),
  'flight.watch_started': segment,
  'flight.status_changed': segment.extend({
    change: flightChangeSchema,
    status: flightStatusSchema,
  }),
  // Boarding opened (or its estimate, dep − 40 min, passed): the traveller's boarding ping.
  'flight.boarding_open': segment.extend({ estimated: z.boolean() }),
  'flight.landed': segment.extend({
    user_ids: z.array(z.uuid()),
    source: z.enum(['provider', 'manual']),
  }),
  'insurance.saved': z.object({ user_id: z.uuid(), policy_id: z.uuid() }),
  'insurance.deleted': z.object({ user_id: z.uuid(), policy_id: z.uuid() }),
  'insurance.shared': z.object({
    user_id: z.uuid(),
    policy_id: z.uuid(),
    help_session_id: z.uuid(),
  }),
} as const satisfies Record<BookingEventType, z.ZodType>;

/** Realtime hint types on `crew_bookings:{crew_id}` (ids only; rows arrive through sync). */
export const BOOKINGS_RT = {
  importCandidate: 'import.candidate',
  importQuarantined: 'import.quarantined',
  bookingAdded: 'booking.added',
  bookingEdited: 'booking.edited',
  bookingDeleted: 'booking.deleted',
  flightStatus: 'flight.status',
} as const;
