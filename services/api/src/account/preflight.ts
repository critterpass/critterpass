/**
 * The delete-account preflight (3n-9, `GET /v1/me/deletion/preflight`): the real numbers behind
 * "what goes and what the crew keeps". Balances come from the ledger the same way the close
 * snapshots them, organiser hand-overs from the same successor rule the close applies, so the page
 * promises exactly what the close will do. Read as the system: the caller's own uid only.
 */
import type { DeletionPreflight } from '@cp/domain';
import type pg from 'pg';

import { crewBalances } from './balances';
import { organisedTrips } from './organiser-transfer';

/** Subscription states the store still bills (or will bill again after a pause or a retry). */
const BILLED_STATUSES = ['active', 'grace', 'billing_retry', 'on_hold', 'paused'];

export async function deletionPreflight(
  tx: pg.PoolClient,
  uid: string,
): Promise<DeletionPreflight> {
  const identity = await tx.query<{ has: boolean }>('SELECT app.account_has_identity($1) AS has', [
    uid,
  ]);
  const counts = await tx.query<{ critters: number; stamps: number }>(
    `SELECT (SELECT count(DISTINCT form_id)::int FROM collection_entries
              WHERE user_id = $1 AND verification <> 'revoked') AS critters,
            (SELECT count(*)::int FROM stamps WHERE user_id = $1) AS stamps`,
    [uid],
  );
  const balances = await crewBalances(tx, uid);
  const organised = await organisedTrips(tx, uid);
  const successorIds = organised.flatMap((trip) => (trip.transferTo ? [trip.transferTo] : []));
  const names = new Map<string, string | null>();
  if (successorIds.length > 0) {
    const { rows } = await tx.query<{ id: string; display_name: string | null }>(
      'SELECT id, display_name FROM users WHERE id = ANY($1::uuid[])',
      [successorIds],
    );
    for (const row of rows) names.set(row.id, row.display_name);
  }
  const active = await tx.query<{ trip_id: string; trip_name: string | null }>(
    `SELECT t.id AS trip_id, d.name AS trip_name
       FROM trip_participants p
       JOIN trips t ON t.id = p.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE p.user_id = $1 AND p.rsvp = 'in' AND t.status = 'in_trip'
      ORDER BY t.start_date NULLS LAST LIMIT 1`,
    [uid],
  );
  const subscription = await tx.query<{ platform: DeletionPreflightSource }>(
    `SELECT platform FROM subscriptions
      WHERE user_id = $1 AND status = ANY($2::text[])
      ORDER BY period_end DESC NULLS LAST LIMIT 1`,
    [uid, BILLED_STATUSES],
  );
  const activeTrip = active.rows[0];
  const billed = subscription.rows[0];
  return {
    instant: identity.rows[0]?.has !== true,
    critters: counts.rows[0]?.critters ?? 0,
    stamps: counts.rows[0]?.stamps ?? 0,
    balances: balances.map((b) => ({
      crew_id: b.crewId,
      crew_name: b.crewName,
      currency: b.currency,
      net_minor: b.netMinor,
    })),
    organised_trips: organised.map((trip) => ({
      trip_id: trip.tripId,
      trip_name: trip.tripName,
      transfer_to_name: trip.transferTo ? (names.get(trip.transferTo) ?? null) : null,
      sole_member: trip.soleMember,
    })),
    active_trip: activeTrip
      ? { trip_id: activeTrip.trip_id, trip_name: activeTrip.trip_name }
      : null,
    subscription: billed ? { source: billed.platform } : null,
  };
}

type DeletionPreflightSource = NonNullable<DeletionPreflight['subscription']>['source'];
