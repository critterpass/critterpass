/**
 * What the booking commands share: the trip as the caller sees it, who takes part in it (its
 * participants who have not said no and are still in the crew; travellers and payers must be among
 * them), the booking as the server holds it (read as the system, then shown only to its owner or,
 * when shared, the trip's crew), the edit rule (the owner or an organiser) and the realtime hints on
 * `crew_bookings:{crew_id}` (ids only, and only for crew bookings).
 */
import { outbox } from '@cp/db';
import {
  channelName,
  DomainError,
  type BOOKINGS_RT,
  type BookingDetails,
  type BookingKind,
  type BookingVisibility,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import {
  isTripOrganiser,
  requireMoneyMember,
  tripMoneyMembers,
  type MoneyTrip,
} from '../money/shared';

export type BookingTrip = MoneyTrip;

/** The trip, when the caller takes part in it; anyone else gets `NOT_FOUND` or `NOT_ELIGIBLE`. */
export function requireTripParticipant(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<BookingTrip> {
  return requireMoneyMember(tx, tripId, uid);
}

/** Every named traveller or payer must take part in the trip. */
export async function requireInTrip(
  tx: pg.PoolClient,
  tripId: string,
  named: readonly string[],
): Promise<void> {
  const members = await tripMoneyMembers(tx, tripId);
  const missing = named.filter((uid) => !members.includes(uid));
  if (missing.length > 0) {
    throw new DomainError('VALIDATION', { reason: 'not_in_trip', user_ids: missing });
  }
}

export interface StoredBooking {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly owner_id: string;
  readonly type: BookingKind;
  readonly title: string;
  readonly starts_at: Date | null;
  readonly ends_at: Date | null;
  readonly tz: string | null;
  readonly location: string | null;
  readonly traveller_ids: string[];
  readonly price_minor: string | null;
  readonly currency: string | null;
  readonly paid_by: string | null;
  readonly supplier: string;
  readonly supplier_ref: string | null;
  readonly free_cancel_until: Date | null;
  readonly cancel_policy_text: string | null;
  readonly status: string;
  readonly visibility: BookingVisibility;
  readonly flight_crew_visible: boolean;
  readonly details: BookingDetails;
  readonly deleted_at: Date | null;
  readonly version: number;
}

/**
 * The live booking as the server holds it (`lock`: under its row lock), when the caller may see
 * it: its owner, or the trip's crew for a crew booking. Anyone else, and a deleted booking, is
 * `NOT_FOUND` (never leaking that it exists).
 */
export async function loadBooking(
  tx: pg.PoolClient,
  bookingId: string,
  uid: string,
  lock = false,
): Promise<StoredBooking> {
  const booking = await asSystemRole(tx, async () => {
    const { rows } = await tx.query<StoredBooking>(
      `SELECT b.id, b.trip_id, t.crew_id, b.owner_id, b.type, b.title, b.starts_at, b.ends_at, b.tz,
              b.location, b.traveller_ids, b.price_minor::text AS price_minor, b.currency,
              b.paid_by, b.supplier, b.supplier_ref, b.free_cancel_until, b.cancel_policy_text,
              b.status, b.visibility, b.flight_crew_visible, b.details, b.deleted_at, b.version
         FROM bookings b JOIN trips t ON t.id = b.trip_id
        WHERE b.id = $1 ${lock ? 'FOR UPDATE OF b' : ''}`,
      [bookingId],
    );
    return rows[0];
  });
  if (booking === undefined || booking.deleted_at !== null) {
    throw new DomainError('NOT_FOUND', { reason: 'booking' });
  }
  if (booking.owner_id === uid) return booking;
  if (booking.visibility === 'crew') {
    const { rows } = await tx.query<{ member: boolean }>(
      'SELECT app.is_trip_member($1) AS member',
      [booking.trip_id],
    );
    if (rows[0]?.member === true) return booking;
  }
  throw new DomainError('NOT_FOUND', { reason: 'booking' });
}

/** Whoever owns a booking may change it, and so may any of the trip's organisers. */
export async function requireBookingEditor(
  tx: pg.PoolClient,
  booking: Pick<StoredBooking, 'owner_id' | 'trip_id'>,
  uid: string,
): Promise<void> {
  if (booking.owner_id === uid) return;
  if (await isTripOrganiser(tx, booking.trip_id)) return;
  throw new DomainError('FORBIDDEN', { reason: 'not_owner_or_organiser' });
}

export function requireVersion(booking: Pick<StoredBooking, 'version'>, base: number | undefined) {
  if (base !== undefined && base !== booking.version) {
    throw new DomainError('VERSION_CONFLICT', { current_version: booking.version });
  }
}

/** A crew-channel hint, for crew bookings only (a personal booking's id never reaches the crew). */
export async function publishBooking(
  tx: pg.PoolClient,
  crewId: string,
  visibility: BookingVisibility,
  type: (typeof BOOKINGS_RT)[keyof typeof BOOKINGS_RT],
  data: Readonly<Record<string, unknown>>,
): Promise<void> {
  if (visibility !== 'crew') return;
  await outbox(tx, channelName('crew_bookings', crewId), type, data);
}
