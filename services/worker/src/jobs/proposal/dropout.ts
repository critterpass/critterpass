/**
 * `trip.dropout`: after a member declines (the only trigger: `decline_trip` or an explicit OUT),
 * the cost engine re-packs rooms and re-splits shared costs without them, and the result is kept
 * on `trip_dropouts` as the change list the organiser works through and resolves
 * (`resolve_dropout`). Once per (trip, member): a retried or repeated job finds its row and
 * changes nothing. Nothing moves until the organiser resolves it.
 */
import { outbox, withSystem } from '@cp/db';
import { PROPOSAL_QUEUES, userChannel } from '@cp/domain';
import {
  buildDropoutChangeSet,
  costStateFromRows,
  type AffiliateStay,
  type CostComponentRow,
  type SupplierSeat,
} from '@cp/planner';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export interface DropoutOutcome {
  readonly status: 'built' | 'already_built' | 'nothing_to_split' | 'not_out';
  readonly dropoutId: string | null;
}

async function supplierSeats(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<SupplierSeat[]> {
  const { rows } = await tx.query<{ id: string; seats: number }>(
    `SELECT o.id, greatest(cardinality(b.traveller_ids), 1) AS seats
       FROM supplier_orders o JOIN bookings b ON b.id = o.voucher_booking_id
      WHERE o.trip_id = $1 AND o.status IN ('confirmed', 'pending_operator') AND $2 = ANY (b.traveller_ids)`,
    [tripId, uid],
  );
  return rows.map((row) => ({ orderId: row.id, seats: row.seats }));
}

async function affiliateStays(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<AffiliateStay[]> {
  const { rows } = await tx.query<{ id: string; supplier: string }>(
    `SELECT id, supplier FROM bookings
      WHERE trip_id = $1 AND type = 'stay' AND status = 'booked' AND deleted_at IS NULL
        AND source <> 'viator' AND $2 = ANY (traveller_ids)`,
    [tripId, uid],
  );
  return rows.map((row) => ({ bookingId: row.id, supplier: row.supplier }));
}

export async function runDropout(
  pool: pg.Pool,
  tripId: string,
  uid: string,
): Promise<DropoutOutcome> {
  return withSystem(pool, async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `dropout:${tripId}:${uid}`,
    ]);
    const done = await tx.query<{ id: string }>(
      'SELECT id FROM trip_dropouts WHERE trip_id = $1 AND user_id = $2',
      [tripId, uid],
    );
    if (done.rows[0] !== undefined) return { status: 'already_built', dropoutId: done.rows[0].id };
    const participant = await tx.query<{ rsvp: string }>(
      'SELECT rsvp FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
      [tripId, uid],
    );
    if (participant.rows[0]?.rsvp !== 'out') return { status: 'not_out', dropoutId: null };
    const trip = await tx.query<{
      version_id: string | null;
      currency: string;
    }>(
      `SELECT t.current_version_id AS version_id, coalesce(c.settlement_currency, 'USD') AS currency
         FROM trips t JOIN crews c ON c.id = t.crew_id WHERE t.id = $1`,
      [tripId],
    );
    const members = await tx.query<{ user_id: string }>(
      `SELECT user_id FROM trip_participants WHERE trip_id = $1 AND (holds_seat OR user_id = $2)
        ORDER BY user_id`,
      [tripId, uid],
    );
    const rows = await tx.query<CostComponentRow>(
      `SELECT component_key, kind, unit, member_ids, amount_minor::text AS amount_minor, currency,
              source, seen_at, origin, label
         FROM cost_components WHERE trip_id = $1 ORDER BY component_key`,
      [tripId],
    );
    const attended = await tx.query<{ stable_id: string }>(
      `SELECT stable_id FROM plan_items WHERE version_id = $1 AND $2 = ANY (attendee_ids)`,
      [trip.rows[0]?.version_id ?? null, uid],
    );
    const state = costStateFromRows({
      currency: trip.rows[0]?.currency ?? 'USD',
      members: members.rows.map((m) => ({ uid: m.user_id, origin: null })),
      rows: rows.rows,
    });
    const built =
      state.members.length < 2
        ? null
        : buildDropoutChangeSet(state, {
            leaver: uid,
            attendedItems: attended.rows.map((r) => r.stable_id),
            reminderComponents: new Set(),
            supplierSeats: await supplierSeats(tx, tripId, uid),
            affiliateStays: await affiliateStays(tx, tripId, uid),
          });
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO trip_dropouts (trip_id, user_id, ops, members, cost_delta_minor)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        tripId,
        uid,
        JSON.stringify(built?.ops ?? []),
        JSON.stringify(built?.members ?? []),
        built?.costDeltaMinor.toString() ?? null,
      ],
    );
    const dropoutId = inserted.rows[0]?.id ?? null;
    const organisers = await tx.query<{ user_id: string }>(
      `SELECT user_id FROM trip_participants WHERE trip_id = $1 AND role = 'organiser' AND rsvp <> 'out'`,
      [tripId],
    );
    for (const { user_id } of organisers.rows) {
      await outbox(tx, userChannel(user_id), 'dropout.ready', {
        trip_id: tripId,
        user_id: uid,
        dropout_id: dropoutId,
      });
    }
    return { status: (built?.ops.length ?? 0) === 0 ? 'nothing_to_split' : 'built', dropoutId };
  });
}

export function dropoutJob(): AnyJobDefinition {
  return defineJob({
    queue: PROPOSAL_QUEUES.dropout,
    schema: z.object({ trip_id: z.uuid(), user_id: z.uuid() }),
    singletonKey: (data) => `${data.trip_id}:${data.user_id}`,
    async handler(data, { pool }) {
      return { ...(await runDropout(pool, data.trip_id, data.user_id)) };
    },
  });
}
