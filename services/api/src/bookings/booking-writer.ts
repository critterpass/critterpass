/**
 * Writing a booking with everything that hangs off it, in the command's transaction and as the
 * server: its flight segments (boarding estimated at departure − 40 min until a provider says
 * otherwise), its documents (only the caller's own `booking_doc` uploads), the free-cancellation
 * reminder timer, the domain events (a flight also moves its travellers' countdowns) and the crew
 * hint. Crew visibility is copied onto documents and segments so their streams never join.
 */
import { cancelScheduledEvent, emitEvent, scheduleEvent } from '@cp/db';
import {
  BOOKINGS_QUEUES,
  BOOKINGS_RT,
  boardingTime,
  deadlineReminderAt,
  DomainError,
  type BookingAttachmentKind,
  type BookingDetails,
  type BookingKind,
  type BookingSource,
  type BookingVisibility,
  type FlightSegmentInput,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { publishBooking } from '../commands/bookings/shared';
import { parseMediaKey } from '../media/purposes';
import { armFlightWatch, segmentsOf } from './flight-watch';

export interface AttachmentInput {
  readonly media_key: string;
  readonly kind: BookingAttachmentKind;
  readonly sha256?: string | undefined;
}

export interface NewBooking {
  readonly id: string;
  readonly tripId: string;
  readonly crewId: string;
  readonly ownerId: string;
  readonly kind: BookingKind;
  readonly title: string;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly tz: string | null;
  readonly location: string | null;
  readonly travellerIds: readonly string[];
  readonly priceMinor: bigint | null;
  readonly currency: string | null;
  readonly paidBy: string | null;
  readonly source: BookingSource;
  readonly supplier: string;
  readonly supplierRef: string | null;
  readonly freeCancelUntil: Date | null;
  readonly cancelPolicyText: string | null;
  readonly visibility: BookingVisibility;
  readonly flightCrewVisible: boolean;
  readonly details: BookingDetails;
  /** Sealed barcode (an envelope from `packages/db/crypto`) and its symbology. */
  readonly barcode: { readonly format: string; readonly payloadEnc: string } | null;
  readonly segments: readonly FlightSegmentInput[];
  readonly attachments: readonly AttachmentInput[];
}

/** Segments reach the crew when the booking is shared or its owner left the flight visible. */
export function segmentsCrewVisible(visibility: BookingVisibility, flightCrewVisible: boolean) {
  return visibility === 'crew' || flightCrewVisible;
}

interface SegmentOwner {
  readonly id: string;
  readonly tripId: string;
  readonly ownerId: string;
  readonly visibility: BookingVisibility;
  readonly flightCrewVisible: boolean;
}

/** Replaces a booking's segments; returns their ids in order. */
export async function writeSegments(
  tx: pg.PoolClient,
  booking: SegmentOwner,
  segments: readonly FlightSegmentInput[],
): Promise<string[]> {
  return asSystemRole(tx, async () => {
    await tx.query('DELETE FROM flight_segments WHERE booking_id = $1', [booking.id]);
    const ids: string[] = [];
    for (const [index, segment] of segments.entries()) {
      const boarding = boardingTime({
        schedDepAt: new Date(segment.sched_dep_at),
        announcedAt: segment.boarding_at === undefined ? null : new Date(segment.boarding_at),
      });
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, segment_no, carrier,
           flight_no, dep_airport, arr_airport, sched_dep_at, sched_arr_at, boarding_at,
           boarding_estimated, gate, terminal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
        [
          booking.id,
          booking.tripId,
          booking.ownerId,
          segmentsCrewVisible(booking.visibility, booking.flightCrewVisible),
          index + 1,
          segment.carrier,
          segment.flight_no,
          segment.dep_airport,
          segment.arr_airport,
          segment.sched_dep_at,
          segment.sched_arr_at ?? null,
          boarding.at,
          boarding.estimated,
          segment.gate ?? null,
          segment.terminal ?? null,
        ],
      );
      ids.push(rows[0]?.id as string);
    }
    return ids;
  });
}

/** Attaches the caller's own `booking_doc` uploads; anyone else's key is refused. */
export async function writeAttachments(
  tx: pg.PoolClient,
  booking: SegmentOwner,
  attachments: readonly AttachmentInput[],
  uid: string,
): Promise<void> {
  for (const attachment of attachments) {
    const parsed = parseMediaKey(attachment.media_key);
    if (parsed === undefined || parsed.ownerId !== uid || parsed.purpose !== 'booking_doc') {
      throw new DomainError('VALIDATION', { reason: 'attachment_not_yours' });
    }
  }
  await asSystemRole(tx, async () => {
    for (const attachment of attachments) {
      await tx.query(
        `INSERT INTO booking_attachments (booking_id, trip_id, owner_id, crew_visible, media_key,
           kind, sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (booking_id, media_key) DO NOTHING`,
        [
          booking.id,
          booking.tripId,
          booking.ownerId,
          booking.visibility === 'crew',
          attachment.media_key,
          attachment.kind,
          attachment.sha256 ?? null,
        ],
      );
    }
  });
}

/** Keeps documents and segments in step with the booking's visibility. */
export async function syncCopiedVisibility(tx: pg.PoolClient, booking: SegmentOwner) {
  await asSystemRole(tx, async () => {
    await tx.query('UPDATE booking_attachments SET crew_visible = $2 WHERE booking_id = $1', [
      booking.id,
      booking.visibility === 'crew',
    ]);
    await tx.query('UPDATE flight_segments SET crew_visible = $2 WHERE booking_id = $1', [
      booking.id,
      segmentsCrewVisible(booking.visibility, booking.flightCrewVisible),
    ]);
  });
}

/** Arms (or re-arms, or cancels) the day-before reminder of a free-cancellation deadline. */
export async function armDeadlineReminder(
  tx: pg.PoolClient,
  booking: {
    readonly id: string;
    readonly tz: string | null;
    readonly freeCancelUntil: Date | null;
  },
  now: Date,
): Promise<void> {
  const key = { kind: BOOKINGS_QUEUES.deadlineReminder, refId: booking.id };
  const at =
    booking.freeCancelUntil === null ? null : deadlineReminderAt(booking.freeCancelUntil, now);
  if (at === null) {
    await cancelScheduledEvent(tx, key);
    return;
  }
  await scheduleEvent(tx, { ...key, tz: booking.tz ?? 'UTC', at });
}

/** `booking.flight_*` for the countdown: the travellers whose first departure may have moved. */
export async function emitFlightChange(
  tx: pg.PoolClient,
  type: 'booking.flight_added' | 'booking.flight_changed' | 'booking.flight_removed',
  booking: { readonly id: string; readonly tripId: string; readonly crewId: string },
  travellerIds: readonly string[],
  actorId: string,
): Promise<void> {
  await emitEvent(tx, {
    type,
    aggregateKind: 'booking',
    aggregateId: booking.id,
    actorKind: 'user',
    actorId,
    crewId: booking.crewId,
    tripId: booking.tripId,
    payload: { trip_id: booking.tripId, booking_id: booking.id, user_ids: [...travellerIds] },
  });
}

/** Inserts a new booking with its segments, documents, reminder, events and crew hint. */
export async function insertBooking(
  tx: pg.PoolClient,
  booking: NewBooking,
  actorId: string,
  now: Date,
): Promise<{ segmentIds: string[] }> {
  await asSystemRole(tx, async () => {
    const existing = await tx.query('SELECT 1 FROM bookings WHERE id = $1', [booking.id]);
    if ((existing.rowCount ?? 0) > 0) {
      throw new DomainError('STATE_INVALID', { reason: 'booking_exists' });
    }
    await tx.query(
      `INSERT INTO bookings (id, trip_id, owner_id, type, title, starts_at, ends_at, tz, location,
         traveller_ids, price_minor, currency, paid_by, source, supplier, supplier_ref,
         free_cancel_until, cancel_policy_text, visibility, flight_crew_visible, details,
         barcode_payload_enc, barcode_format)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
         $20, $21, $22, $23)`,
      [
        booking.id,
        booking.tripId,
        booking.ownerId,
        booking.kind,
        booking.title,
        booking.startsAt,
        booking.endsAt,
        booking.tz,
        booking.location,
        booking.travellerIds,
        booking.priceMinor?.toString() ?? null,
        booking.currency,
        booking.paidBy,
        booking.source,
        booking.supplier,
        booking.supplierRef,
        booking.freeCancelUntil,
        booking.cancelPolicyText,
        booking.visibility,
        booking.flightCrewVisible,
        JSON.stringify(booking.details),
        booking.barcode?.payloadEnc ?? null,
        booking.barcode?.format ?? null,
      ],
    );
  });
  const segmentIds =
    booking.segments.length > 0 ? await writeSegments(tx, booking, booking.segments) : [];
  await writeAttachments(tx, booking, booking.attachments, actorId);
  await armDeadlineReminder(tx, booking, now);
  await emitEvent(tx, {
    type: 'booking.added',
    aggregateKind: 'booking',
    aggregateId: booking.id,
    actorKind: 'user',
    actorId,
    crewId: booking.crewId,
    tripId: booking.tripId,
    payload: {
      trip_id: booking.tripId,
      booking_id: booking.id,
      kind: booking.kind,
      source: booking.source,
    },
  });
  if (booking.kind === 'flight') {
    await emitFlightChange(tx, 'booking.flight_added', booking, booking.travellerIds, actorId);
    // Every wallet flight is watched (free), from the moment it is added.
    await asSystemRole(tx, async () => armFlightWatch(tx, await segmentsOf(tx, booking.id), now));
  }
  await publishBooking(tx, booking.crewId, booking.visibility, BOOKINGS_RT.bookingAdded, {
    booking_id: booking.id,
    trip_id: booking.tripId,
  });
  return { segmentIds };
}
