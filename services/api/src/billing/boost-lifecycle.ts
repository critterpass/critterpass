/**
 * A boost after activation (docs/data-model-sync-and-privacy.md §3.3): its window follows the
 * trip's dates, it ends at the window's close (redrafts, live map and new seats over six pause;
 * nobody is removed), a cancelled trip's boost moves to the crew's next trip or becomes a credit
 * that never expires, and a credit can be spent on any trip of the crew. Every step is written as
 * the server and is idempotent: a stale timer or a repeated job finds nothing left to do.
 */
import { emitEvent } from '@cp/db';
import { DomainError, type TripBoostState } from '@cp/domain';
import type pg from 'pg';

import { recomputeTrip } from '../entitlements';
import { armBoostExpiry } from './activate-boost';
import { publishBoostState } from './boost-rt';

export interface BoostRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly buyer_id: string | null;
  readonly status: TripBoostState;
  readonly ends_at: Date;
  readonly store_transaction_id: string | null;
}

export const BOOST_COLUMNS =
  'id, trip_id, crew_id, buyer_id, status, ends_at, store_transaction_id';

const ref = (boost: BoostRow) => ({ id: boost.id, tripId: boost.trip_id, crewId: boost.crew_id });

export async function loadBoost(tx: pg.PoolClient, id: string): Promise<BoostRow> {
  const { rows } = await tx.query<BoostRow>(
    `SELECT ${BOOST_COLUMNS} FROM trip_boosts WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const boost = rows[0];
  if (boost === undefined) throw new DomainError('NOT_FOUND', { reason: 'boost' });
  return boost;
}

/** `boost.expire`: ends a boost whose window has closed (a window moved later is left alone). */
export async function expireBoost(tx: pg.PoolClient, boostId: string, now: Date) {
  const boost = await loadBoost(tx, boostId);
  if ((boost.status !== 'active' && boost.status !== 'scheduled') || boost.ends_at > now) {
    return { boost_id: boost.id, status: boost.status };
  }
  await tx.query("UPDATE trip_boosts SET status = 'ended' WHERE id = $1", [boost.id]);
  await publishBoostState(tx, ref(boost), 'ended');
  await emitEvent(tx, {
    type: 'boost.ended',
    aggregateKind: 'trip_boost',
    aggregateId: boost.id,
    actorKind: 'system',
    actorId: null,
    crewId: boost.crew_id,
    tripId: boost.trip_id,
    payload: { trip_id: boost.trip_id, crew_id: boost.crew_id, boost_id: boost.id },
  });
  await recomputeTrip(tx, boost.trip_id, { now: () => now });
  return { boost_id: boost.id, status: 'ended' };
}

/**
 * The trip's dates moved: every boost and first-trip-free window on it moves with them (an ended
 * boost whose window reopens is active again), and each boost's expiry timer is re-armed.
 */
export async function followTripDates(tx: pg.PoolClient, tripId: string, now: Date) {
  const { rows } = await tx.query<BoostRow>(
    `UPDATE trip_boosts SET ends_at = greatest(app.boost_window_end(trip_id, starts_at),
                                               starts_at + interval '1 day'),
       status = CASE WHEN status = 'ended'
                      AND app.boost_window_end(trip_id, starts_at) > $2 THEN 'active'
                     ELSE status END
     WHERE trip_id = $1 AND status IN ('scheduled', 'active', 'ended')
     RETURNING ${BOOST_COLUMNS}`,
    [tripId, now],
  );
  for (const boost of rows) {
    if (boost.status !== 'ended') await armBoostExpiry(tx, boost.id, boost.ends_at);
    await publishBoostState(tx, ref(boost), boost.status);
  }
  await tx.query(
    `UPDATE ftf_grants SET ends_at = greatest(app.boost_window_end(trip_id, starts_at),
                                              starts_at + interval '1 day')
      WHERE trip_id = $1`,
    [tripId],
  );
}

/** The crew's next trip a boost can go to: the soonest live one other than `fromTripId`. */
export async function nextTripFor(
  tx: pg.PoolClient,
  crewId: string,
  fromTripId: string,
  now: Date,
): Promise<string | undefined> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT t.id FROM trips t
      WHERE t.crew_id = $1 AND t.id <> $2
        AND t.status NOT IN ('post_trip', 'archived', 'cancelled')
        AND (t.end_date IS NULL OR app.boost_window_end(t.id, $3) > $3)
        AND NOT EXISTS (SELECT 1 FROM trip_boosts b WHERE b.trip_id = t.id
                         AND b.status IN ('scheduled', 'active'))
      ORDER BY t.start_date NULLS LAST, t.created_at LIMIT 1`,
    [crewId, fromTripId, now],
  );
  return rows[0]?.id;
}

/** Starts a boost on `toTripId` carried over from `from` (a moved boost or a spent credit). */
export async function startCarriedBoost(
  tx: pg.PoolClient,
  input: {
    readonly toTripId: string;
    readonly crewId: string;
    readonly buyerId: string | null;
    readonly fromTripId: string | null;
    readonly fromBoostId: string | null;
  },
  now: Date,
): Promise<string> {
  const { rows } = await tx.query<{ id: string; ends_at: Date }>(
    `INSERT INTO trip_boosts (trip_id, crew_id, buyer_id, source, starts_at, ends_at, status,
       moved_from_trip_id, moved_from_boost_id)
     VALUES ($1, $2, $3, 'moved', $4, greatest(app.boost_window_end($1, $4), $4 + interval '1 day'),
       'active', $5, $6)
     RETURNING id, ends_at`,
    [input.toTripId, input.crewId, input.buyerId, now, input.fromTripId, input.fromBoostId],
  );
  const started = rows[0];
  if (started === undefined) throw new Error('carried boost insert returned no row');
  await armBoostExpiry(tx, started.id, started.ends_at);
  await publishBoostState(
    tx,
    { id: started.id, tripId: input.toTripId, crewId: input.crewId },
    'active',
  );
  await recomputeTrip(tx, input.toTripId, { now: () => now });
  return started.id;
}

/**
 * Moves a live boost off its trip: to `toTripId` when given (or the crew's next trip), otherwise
 * into a crew credit. Returns where it went.
 */
export async function moveBoost(
  tx: pg.PoolClient,
  boost: BoostRow,
  toTripId: string | undefined,
  now: Date,
): Promise<{ to_trip_id: string | null; credit_id: string | null; boost_id: string | null }> {
  if (boost.status !== 'active' && boost.status !== 'scheduled') {
    throw new DomainError('STATE_INVALID', { reason: 'boost_not_movable' });
  }
  const target = toTripId ?? (await nextTripFor(tx, boost.crew_id, boost.trip_id, now));
  let movedTo: string | null = null;
  let creditId: string | null = null;
  if (target === undefined) {
    await tx.query("UPDATE trip_boosts SET status = 'credit' WHERE id = $1", [boost.id]);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO boost_credits (crew_id, user_id, reason, from_boost_id)
       VALUES ($1, $2, 'trip_cancelled', $3) RETURNING id`,
      [boost.crew_id, boost.buyer_id, boost.id],
    );
    creditId = rows[0]?.id ?? null;
  } else {
    await tx.query("UPDATE trip_boosts SET status = 'moved' WHERE id = $1", [boost.id]);
    movedTo = await startCarriedBoost(
      tx,
      {
        toTripId: target,
        crewId: boost.crew_id,
        buyerId: boost.buyer_id,
        fromTripId: boost.trip_id,
        fromBoostId: boost.id,
      },
      now,
    );
  }
  await publishBoostState(tx, ref(boost), movedTo === null ? 'credit' : 'moved');
  await emitEvent(tx, {
    type: 'boost.moved',
    aggregateKind: 'trip_boost',
    aggregateId: boost.id,
    actorKind: 'system',
    actorId: null,
    crewId: boost.crew_id,
    tripId: boost.trip_id,
    payload: {
      crew_id: boost.crew_id,
      boost_id: boost.id,
      from_trip_id: boost.trip_id,
      to_trip_id: target ?? null,
      credit_id: creditId,
    },
  });
  await recomputeTrip(tx, boost.trip_id, { now: () => now });
  return { to_trip_id: target ?? null, credit_id: creditId, boost_id: movedTo };
}

/** A cancelled trip gives up its live boosts (job `boost.trip_changed`); otherwise a no-op. */
export async function onTripChanged(tx: pg.PoolClient, tripId: string, now: Date) {
  const { rows: trips } = await tx.query<{ status: string }>(
    'SELECT status FROM trips WHERE id = $1',
    [tripId],
  );
  if (trips[0]?.status !== 'cancelled') return { moved: 0 };
  const { rows } = await tx.query<BoostRow>(
    `SELECT ${BOOST_COLUMNS} FROM trip_boosts
      WHERE trip_id = $1 AND status IN ('scheduled', 'active') FOR UPDATE`,
    [tripId],
  );
  for (const boost of rows) await moveBoost(tx, boost, undefined, now);
  return { moved: rows.length };
}
