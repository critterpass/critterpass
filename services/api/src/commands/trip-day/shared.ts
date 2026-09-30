/**
 * What the trip day commands share: who may act on a leave-by (a member the item is for), on a
 * trip (a participant not answered `out`), as organiser, and the realtime hints on
 * `trip_dayof:{trip_id}`. Lookups run as the caller (their RLS view); writes switch to app_system
 * through `asSystemRole` after the check.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { channelName, DomainError, type ReadinessState } from '@cp/domain';
import { knockReason, readinessEnvelope } from '@cp/planner';
import type pg from 'pg';

export interface LeaveByAccess {
  readonly id: string;
  readonly trip_id: string;
  readonly leave_at: Date;
  readonly state: string;
  readonly participant_ids: string[];
  readonly snooze_limit: number;
}

/** The leave-by as the caller sees it; they must be one of the members it is for. */
export async function requireLeaveByMember(
  tx: pg.PoolClient,
  leaveById: string,
  uid: string,
): Promise<LeaveByAccess> {
  const { rows } = await tx.query<LeaveByAccess>(
    `SELECT id, trip_id, leave_at, state, participant_ids,
            coalesce((alarm_policy->>'snooze_limit')::int, 1) AS snooze_limit
       FROM leave_bys WHERE id = $1`,
    [leaveById],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'leave_by' });
  if (!row.participant_ids.includes(uid)) {
    throw new DomainError('NOT_ELIGIBLE', { reason: 'not_on_item' });
  }
  return row;
}

/** A participant of the trip who has not answered `out` (organisers always count). */
export async function requireTripParticipant(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<void> {
  const { rows } = await tx.query<{ on_trip: boolean }>(
    `SELECT app.is_trip_member($1) AND EXISTS (
       SELECT 1 FROM trip_participants
        WHERE trip_id = $1 AND user_id = $2 AND (rsvp <> 'out' OR role = 'organiser')
     ) AS on_trip`,
    [tripId, uid],
  );
  if (rows[0]?.on_trip !== true) throw new DomainError('NOT_ELIGIBLE', { reason: 'not_on_trip' });
}

export async function requireOrganiser(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<void> {
  const { rows } = await tx.query<{ organiser: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM trip_participants WHERE trip_id = $1 AND user_id = $2 AND role = 'organiser'
     ) AND app.is_trip_member($1) AS organiser`,
    [tripId, uid],
  );
  if (rows[0]?.organiser !== true) throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
}

export function publishDayOf(
  tx: pg.PoolClient,
  tripId: string,
  type: 'readiness' | 'packing.checked' | 'leave_by.changed',
  data: unknown,
): Promise<unknown> {
  return outbox(tx, channelName('trip_dayof', tripId), type, data);
}

/** Publishes who is up now for one leave-by (`readiness{leave_by_id, up[], total}`). */
export async function publishReadiness(
  tx: pg.PoolClient,
  tripId: string,
  leaveById: string,
): Promise<void> {
  const { rows } = await tx.query<{ user_id: string; state: ReadinessState }>(
    'SELECT user_id, state FROM readiness WHERE leave_by_id = $1 ORDER BY user_id',
    [leaveById],
  );
  const envelope = readinessEnvelope(
    leaveById,
    rows.map((row) => ({ userId: row.user_id, state: row.state })),
  );
  await publishDayOf(tx, tripId, 'readiness', envelope);
}

/**
 * Asks the crew to knock for `uid` when the snooze count (or the clock) says so; at most once per
 * member and leave-by. Runs as app_system. Returns whether this call sent the knock.
 */
export async function knockIfDue(
  tx: pg.PoolClient,
  leaveBy: LeaveByAccess,
  uid: string,
  now: Date,
): Promise<boolean> {
  const { rows } = await tx.query<{
    state: ReadinessState;
    snooze_count: number;
    knock_sent_at: Date | null;
  }>(
    'SELECT state, snooze_count, knock_sent_at FROM readiness WHERE leave_by_id = $1 AND user_id = $2 FOR UPDATE',
    [leaveBy.id, uid],
  );
  const row = rows[0];
  if (row === undefined) return false;
  const reason = knockReason({
    state: row.state,
    snoozeCount: row.snooze_count,
    snoozeLimit: leaveBy.snooze_limit,
    knockSentAt: row.knock_sent_at,
    now,
    leaveAt: leaveBy.leave_at,
  });
  if (reason === null) return false;
  await tx.query(
    'UPDATE readiness SET knock_sent_at = $3 WHERE leave_by_id = $1 AND user_id = $2',
    [leaveBy.id, uid, now],
  );
  await appendDomainEvent(tx, {
    type: 'leave_by.knocked',
    aggregateKind: 'leave_by',
    aggregateId: leaveBy.id,
    actorKind: 'system',
    actorId: null,
    tripId: leaveBy.trip_id,
    payload: { trip_id: leaveBy.trip_id, leave_by_id: leaveBy.id, user_id: uid, reason },
  });
  return true;
}
