/**
 * Shared checks and writes of the critter commands. Lookups run as the caller (their RLS view);
 * writes switch to app_system through `asSystemRole` after the check. A verified find always
 * leaves through `reward.fanout`, which announces it to the crew and runs the reward handlers.
 */
import { sendInTx } from '@cp/db';
import { CRITTER_QUEUES, DomainError, type RewardFanoutJob } from '@cp/domain';
import type pg from 'pg';

export interface TripSeat {
  readonly status: string;
  readonly start_date: string | null;
  readonly tz: string | null;
  readonly destination_id: string | null;
}

/** The caller is on the trip (RSVP not out, or its organiser) and still in its crew. */
export async function requireTripSeat(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<TripSeat> {
  const { rows } = await tx.query<TripSeat & { on_trip: boolean }>(
    `SELECT t.status, t.start_date::text, t.tz, t.destination_id,
            app.is_trip_member(t.id) AND EXISTS (
              SELECT 1 FROM trip_participants p
               WHERE p.trip_id = t.id AND p.user_id = $2 AND (p.rsvp <> 'out' OR p.role = 'organiser')
            ) AS on_trip
       FROM trips t WHERE t.id = $1`,
    [tripId, uid],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  if (!row.on_trip) throw new DomainError('NOT_ELIGIBLE', { reason: 'not_on_trip' });
  return row;
}

export interface OwnEncounter {
  readonly id: string;
  readonly trip_id: string | null;
  readonly spawn_rule_id: string;
  readonly form_id: string;
  readonly poi_id: string | null;
  readonly state: string;
  readonly started_at: Date;
  readonly verification: string | null;
}

/** The caller's own encounter (RLS hides everyone else's, so another user's id reads as missing). */
export async function ownEncounter(tx: pg.PoolClient, id: string): Promise<OwnEncounter> {
  const { rows } = await tx.query<OwnEncounter>(
    `SELECT id, trip_id, spawn_rule_id, form_id, poi_id, state, started_at, verification
       FROM encounters WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'encounter' });
  return row;
}

export const isActive = (state: string): boolean => state === 'accruing' || state === 'ready';

/** Queues the one announcement of verified finds granted together (same server time). */
export async function announceFinds(
  tx: pg.PoolClient,
  entryIds: readonly string[],
  grantedAt: Date,
): Promise<void> {
  if (entryIds.length === 0) return;
  const job: RewardFanoutJob = {
    kind: 'critter_found',
    entry_ids: [...entryIds],
    granted_at: grantedAt.toISOString(),
  };
  await sendInTx(tx, CRITTER_QUEUES.rewardFanout, job, {
    singletonKey: [...entryIds].sort().join(','),
  });
}
