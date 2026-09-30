/**
 * `leaveby.schedule`: one leave-by timer firing (armed by the recompute).
 * - `traffic_3h`, `traffic_45m`: re-route the trip with live traffic; a moved leave-by re-arms.
 * - `window` (30 minutes out): the ring starts draining and today's offline bundle is refreshed.
 * - `alarm`: members still asleep whose phones never confirmed an alarm get the remote copy.
 * - `t0`: anyone still asleep earns the crew knock (once), and the leave-by is under way.
 */
import {
  appendDomainEvent,
  scheduledJobDataSchema,
  sendInTx,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import { TRIP_DAY_QUEUES, type LeaveByState, type RouteEtaProvider } from '@cp/domain';
import { nextLeaveByState, knockReason, type LeaveByTransition } from '@cp/planner';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { announceLeaveBy, recomputeLeaveBys } from './leaveby-recompute';

interface LeaveByRow {
  id: string;
  trip_id: string;
  leave_at: Date;
  local_date: string;
  state: LeaveByState;
  snooze_limit: number;
}

async function lockLeaveBy(tx: pg.PoolClient, id: string): Promise<LeaveByRow | undefined> {
  const { rows } = await tx.query<LeaveByRow>(
    `SELECT id, trip_id, leave_at, local_date::text AS local_date, state,
            coalesce((alarm_policy->>'snooze_limit')::int, 1) AS snooze_limit
       FROM leave_bys WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0];
}

async function transition(
  tx: pg.PoolClient,
  row: LeaveByRow,
  event: LeaveByTransition,
): Promise<LeaveByState> {
  const next = nextLeaveByState(row.state, event);
  if (next !== row.state) {
    await tx.query('UPDATE leave_bys SET state = $2 WHERE id = $1', [row.id, next]);
    await announceLeaveBy(tx, row.trip_id, row.id, row.leave_at, next);
  }
  return next;
}

/** Members still asleep with no alarm their own phone confirmed. */
async function unconfirmedSleepers(tx: pg.PoolClient, leaveById: string): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT r.user_id FROM readiness r
      WHERE r.leave_by_id = $1 AND r.state = 'not_up'
        AND NOT EXISTS (
          SELECT 1 FROM alarms a
           WHERE a.leave_by_id = r.leave_by_id AND a.user_id = r.user_id
             AND a.state IN ('scheduled', 'alerting', 'snoozed'))
      ORDER BY r.user_id`,
    [leaveById],
  );
  return rows.map((row) => row.user_id);
}

/** Asks the crew to knock for each sleeper due one; returns who. Never twice for one member. */
export async function knockSleepers(
  tx: pg.PoolClient,
  row: LeaveByRow,
  now: Date,
): Promise<string[]> {
  const { rows } = await tx.query<{
    user_id: string;
    state: 'not_up';
    snooze_count: number;
    knock_sent_at: Date | null;
  }>(
    `SELECT user_id, state, snooze_count, knock_sent_at FROM readiness
      WHERE leave_by_id = $1 AND state = 'not_up' AND knock_sent_at IS NULL FOR UPDATE`,
    [row.id],
  );
  const knocked: string[] = [];
  for (const member of rows) {
    const reason = knockReason({
      state: member.state,
      snoozeCount: member.snooze_count,
      snoozeLimit: row.snooze_limit,
      knockSentAt: member.knock_sent_at,
      now,
      leaveAt: row.leave_at,
    });
    if (reason === null) continue;
    await tx.query(
      'UPDATE readiness SET knock_sent_at = $3 WHERE leave_by_id = $1 AND user_id = $2',
      [row.id, member.user_id, now],
    );
    await appendDomainEvent(tx, {
      type: 'leave_by.knocked',
      aggregateKind: 'leave_by',
      aggregateId: row.id,
      actorKind: 'system',
      actorId: null,
      tripId: row.trip_id,
      payload: { trip_id: row.trip_id, leave_by_id: row.id, user_id: member.user_id, reason },
    });
    knocked.push(member.user_id);
  }
  return knocked;
}

export async function runLeaveByTimer(
  pool: pg.Pool,
  data: ScheduledJobData,
  router: RouteEtaProvider,
  now: Date = new Date(),
): Promise<{ outcome: string }> {
  if (data.slot === 'traffic_3h' || data.slot === 'traffic_45m') {
    const { rows } = await pool.query<{ trip_id: string }>(
      "SELECT trip_id FROM leave_bys WHERE id = $1 AND state NOT IN ('cancelled', 'departed')",
      [data.ref_id],
    );
    const tripId = rows[0]?.trip_id;
    if (tripId === undefined) return { outcome: 'gone' };
    const result = await recomputeLeaveBys(pool, tripId, router, now);
    return { outcome: result.changed > 0 ? 'moved' : 'unchanged' };
  }
  return withSystem(pool, async (tx) => {
    const row = await lockLeaveBy(tx, data.ref_id);
    if (row === undefined || row.state === 'cancelled' || row.state === 'departed') {
      return { outcome: 'gone' };
    }
    switch (data.slot) {
      case 'window': {
        await transition(tx, row, 'window_opened');
        await sendInTx(
          tx,
          TRIP_DAY_QUEUES.dayBundle,
          { trip_id: row.trip_id, local_date: row.local_date },
          { singletonKey: `${row.trip_id}:${row.local_date}` },
        );
        return { outcome: 'window' };
      }
      case 'alarm': {
        await transition(tx, row, 'alarm_fired');
        const sleepers = await unconfirmedSleepers(tx, row.id);
        if (sleepers.length > 0) {
          await appendDomainEvent(tx, {
            type: 'leave_by.alarm_due',
            aggregateKind: 'leave_by',
            aggregateId: row.id,
            actorKind: 'system',
            actorId: null,
            tripId: row.trip_id,
            payload: { trip_id: row.trip_id, leave_by_id: row.id, user_ids: sleepers },
          });
        }
        return { outcome: `alarm:${sleepers.length}` };
      }
      case 't0': {
        const knocked = await knockSleepers(tx, row, now);
        await transition(tx, row, 'departed');
        return { outcome: `t0:${knocked.length}` };
      }
      default:
        return { outcome: 'unknown_slot' };
    }
  });
}

export function leaveByScheduleJob(router: RouteEtaProvider): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: TRIP_DAY_QUEUES.leaveBySchedule,
    schema: scheduledJobDataSchema,
    singletonKey: (data: ScheduledJobData) => `${data.ref_id}:${data.slot}`,
    handler: (data, ctx) => runLeaveByTimer(ctx.pool, data, router),
  });
}
