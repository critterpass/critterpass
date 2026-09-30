/**
 * `resolve_import_candidate` (docs/api-contracts.md §4.10, offline): ADD turns a candidate into a
 * wallet booking (and, with `split`, its expense) in one transaction; IGNORE drops it. A candidate
 * shown to the crew is resolved by any member for everyone; the first resolution wins and later
 * ones are refused with where it went. A candidate whose text tripped the injection screen is
 * added only from the app, never from a notification action. A scanned boarding pass that matched
 * a flight already in the wallet adds its barcode and seat to that booking instead.
 */
import { crypto as dbCrypto, emitEvent, outbox } from '@cp/db';
import {
  BOOKINGS_RT,
  channelName,
  defaultBookingVisibility,
  DomainError,
  extractedBookingSchema,
  resolveImportCandidatePayloadSchema,
  type ExtractedBooking,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { splitBookingExpense } from '../../bookings/booking-expense';
import { insertBooking } from '../../bookings/booking-writer';
import type { CommandContext } from '@cp/domain';
import { defineCommand } from '../_framework/define-command';
import type { BookingCommandDeps } from './deps';
import { requireInTrip, requireTripParticipant } from './shared';

interface CandidateRow {
  readonly id: string;
  readonly user_id: string;
  readonly crew_id: string | null;
  readonly trip_id: string | null;
  readonly source: 'forward' | 'mailbox' | 'scan' | 'paste';
  readonly extracted: unknown;
  readonly status: string;
  readonly needs_confirm: boolean;
  readonly booking_id: string | null;
  readonly crew_visible: boolean;
}

/** The candidate the caller may resolve (RLS decides), locked. */
async function loadCandidate(tx: pg.PoolClient, id: string): Promise<CandidateRow> {
  const visible = await tx.query('SELECT 1 FROM import_candidates WHERE id = $1', [id]);
  if ((visible.rowCount ?? 0) === 0) throw new DomainError('NOT_FOUND', { reason: 'candidate' });
  const row = await asSystemRole(tx, async () => {
    const { rows } = await tx.query<CandidateRow>(
      `SELECT id, user_id, crew_id, trip_id, source, extracted, status, needs_confirm, booking_id,
              crew_visible
         FROM import_candidates WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0];
  });
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'candidate' });
  return row;
}

async function settle(
  tx: pg.PoolClient,
  candidate: CandidateRow,
  ctx: CommandContext,
  outcome: { status: 'accepted' | 'rejected'; bookingId: string | null },
): Promise<void> {
  await asSystemRole(tx, () =>
    tx.query(
      `UPDATE import_candidates SET status = $2, booking_id = coalesce($3, booking_id),
         resolved_by = $4, resolved_at = $5 WHERE id = $1`,
      [candidate.id, outcome.status, outcome.bookingId, ctx.uid, ctx.clock.serverNow],
    ),
  );
  await emitEvent(tx, {
    type: 'import.resolved',
    aggregateKind: 'import_candidate',
    aggregateId: candidate.id,
    actorKind: 'user',
    actorId: ctx.uid,
    crewId: candidate.crew_id,
    tripId: candidate.trip_id,
    payload: {
      candidate_id: candidate.id,
      user_id: candidate.user_id,
      action: outcome.status === 'accepted' ? 'add' : 'ignore',
      booking_id: outcome.bookingId,
      by_uid: ctx.uid,
    },
  });
  if (candidate.crew_visible && candidate.crew_id !== null) {
    await outbox(tx, channelName('crew_bookings', candidate.crew_id), BOOKINGS_RT.importCandidate, {
      candidate_id: candidate.id,
      status: outcome.status,
    });
  }
}

/** A boarding pass for a flight already in the wallet: its barcode and seat join that booking. */
async function attachPass(
  tx: pg.PoolClient,
  deps: BookingCommandDeps,
  bookingId: string,
  extracted: ExtractedBooking,
  uid: string,
): Promise<void> {
  const barcode = extracted.barcode;
  if (barcode === null || deps.keyring === undefined) {
    throw new DomainError('STATE_INVALID', { reason: 'already_in_wallet', booking_id: bookingId });
  }
  const sealed = dbCrypto.encryptField(barcode.payload, deps.keyring);
  const updated = await asSystemRole(tx, () =>
    tx.query(
      `UPDATE bookings SET barcode_payload_enc = $2, barcode_format = $3,
         details = details || $4::jsonb, version = version + 1
       WHERE id = $1 AND owner_id = $5 AND deleted_at IS NULL`,
      [
        bookingId,
        sealed,
        barcode.format,
        JSON.stringify(
          extracted.details.seat === undefined ? {} : { seat: extracted.details.seat },
        ),
        uid,
      ],
    ),
  );
  if ((updated.rowCount ?? 0) === 0) {
    throw new DomainError('STATE_INVALID', { reason: 'already_in_wallet', booking_id: bookingId });
  }
}

export function createResolveImportCandidateCommand(deps: BookingCommandDeps) {
  return defineCommand({
    name: 'resolve_import_candidate',
    v: 1,
    schema: resolveImportCandidatePayloadSchema,
    offline: true,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      await loadCandidate(tx, payload.candidate_id);
    },
    handle: async (tx, payload, ctx) => {
      const candidate = await loadCandidate(tx, payload.candidate_id);
      if (candidate.status === 'accepted' || candidate.status === 'rejected') {
        throw new DomainError('STATE_INVALID', {
          reason: 'already_resolved',
          status: candidate.status,
          booking_id: candidate.booking_id,
        });
      }
      if (payload.action === 'ignore') {
        await settle(tx, candidate, ctx, { status: 'rejected', bookingId: null });
        return { candidate_id: candidate.id, status: 'rejected' as const, booking_id: null };
      }
      if (candidate.needs_confirm && ctx.via !== 'app' && ctx.via !== 'offline') {
        throw new DomainError('STATE_INVALID', { reason: 'needs_confirm' });
      }
      const extracted = extractedBookingSchema.safeParse(candidate.extracted);
      if (!extracted.success) throw new DomainError('STATE_INVALID', { reason: candidate.status });
      if (candidate.status === 'duplicate') {
        if (candidate.booking_id === null) {
          throw new DomainError('STATE_INVALID', { reason: 'duplicate' });
        }
        await attachPass(tx, deps, candidate.booking_id, extracted.data, ctx.uid);
        await settle(tx, candidate, ctx, { status: 'accepted', bookingId: candidate.booking_id });
        return {
          candidate_id: candidate.id,
          status: 'accepted' as const,
          booking_id: candidate.booking_id,
        };
      }
      if (candidate.status !== 'pending')
        throw new DomainError('STATE_INVALID', { reason: candidate.status });
      const tripId = payload.trip_id ?? candidate.trip_id;
      if (tripId === null) throw new DomainError('VALIDATION', { reason: 'trip_id' });
      const trip = await requireTripParticipant(tx, tripId, ctx.uid);
      const booking = extracted.data;
      const travellerIds = payload.traveller_ids ?? [ctx.uid];
      await requireInTrip(tx, trip.id, travellerIds);
      const bookingId = payload.booking_id ?? candidate.id;
      const sealed =
        booking.barcode === null || deps.keyring === undefined
          ? null
          : {
              format: booking.barcode.format,
              payloadEnc: dbCrypto.encryptField(booking.barcode.payload, deps.keyring),
            };
      const now = ctx.clock.serverNow;
      const row = {
        id: bookingId,
        tripId: trip.id,
        crewId: trip.crew_id,
        ownerId: ctx.uid,
        kind: booking.kind,
        title: booking.title,
        startsAt: booking.starts_at === null ? null : new Date(booking.starts_at),
        endsAt: booking.ends_at === null ? null : new Date(booking.ends_at),
        tz: booking.tz ?? trip.tz,
        location: booking.location,
        travellerIds,
        priceMinor: booking.price === null ? null : BigInt(booking.price.amount_minor),
        currency: booking.price?.currency ?? null,
        paidBy: null,
        source: candidate.source,
        supplier: booking.supplier,
        supplierRef: booking.supplier_ref,
        freeCancelUntil:
          booking.free_cancel_until === null ? null : new Date(booking.free_cancel_until),
        cancelPolicyText: booking.cancel_policy_text,
        visibility:
          payload.visibility ?? defaultBookingVisibility(booking.kind, travellerIds.length),
        flightCrewVisible: true,
        details: booking.details,
        barcode: sealed,
        segments: booking.segments,
        attachments: [],
      };
      await insertBooking(tx, row, ctx.uid, now);
      let expenseId: string | undefined;
      if (payload.split !== undefined && row.priceMinor !== null && row.currency !== null) {
        const expense = await splitBookingExpense(
          tx,
          trip,
          { ...row, priceMinor: row.priceMinor, currency: row.currency },
          payload.split,
          ctx.uid,
          now,
        );
        expenseId = expense.expense_id;
      }
      await settle(tx, candidate, ctx, { status: 'accepted', bookingId });
      return {
        candidate_id: candidate.id,
        status: 'accepted' as const,
        booking_id: bookingId,
        ...(expenseId === undefined ? {} : { expense_id: expenseId }),
      };
    },
  });
}
