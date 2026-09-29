/**
 * `setup.lottery_remind` (the `scheduled_events` timers `track_lottery` arms): the day before
 * entries close, and when results come out, the member who tracked it hears from the guide (N-45).
 * Its `reminders` row is marked fired; a must-do removed since, or a reminder already sent, sends
 * nothing.
 */
import {
  appendDomainEvent,
  scheduledJobDataSchema,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import { SETUP_QUEUES } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';

export async function remindLottery(
  pool: pg.Pool,
  timer: Pick<ScheduledJobData, 'ref_id' | 'data'>,
): Promise<'reminded' | 'gone'> {
  const uid = typeof timer.data['user_id'] === 'string' ? timer.data['user_id'] : null;
  const slot = timer.data['slot'] === 'result' ? 'result' : 'deadline';
  if (uid === null) return 'gone';
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ trip_id: string }>(
      'SELECT trip_id FROM must_dos WHERE id = $1 AND deleted_at IS NULL',
      [timer.ref_id],
    );
    const tripId = rows[0]?.trip_id;
    if (tripId === undefined) return 'gone';
    const fired = await tx.query(
      `UPDATE reminders SET status = 'fired', fired_at = now()
        WHERE user_id = $1 AND target_kind = 'must_do' AND target_id = $2 AND status = 'pending'
          AND condition->>'slot' = $3`,
      [uid, timer.ref_id, slot],
    );
    if ((fired.rowCount ?? 0) === 0) return 'gone';
    await appendDomainEvent(tx, {
      type: 'lottery.reminder_due',
      aggregateKind: 'must_do',
      aggregateId: timer.ref_id,
      actorKind: 'guide',
      actorId: null,
      tripId,
      payload: { trip_id: tripId, user_id: uid, must_do_id: timer.ref_id, slot },
    });
    return 'reminded';
  });
}

export function lotteryRemindJob(): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: SETUP_QUEUES.lotteryRemind,
    schema: scheduledJobDataSchema,
    singletonKey: (data) => `${data.ref_id}:${data.slot}`,
    handler: async (data, ctx) => ({ outcome: await remindLottery(ctx.pool, data) }),
  });
}
