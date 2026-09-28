/**
 * `nudge.dispatch` (docs/api-contracts-async.md §2.3): fired by the `scheduled_events` timer
 * `send_nudge` armed at the target's engagement hour. Marks the nudge and its scheduled delivery
 * sent and appends `nudge.received`, whose hooks file the inbox item and route the N-12 push in the
 * same transaction. A nudge already sent (a replayed timer) changes nothing.
 */
import {
  appendDomainEvent,
  scheduledJobDataSchema,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import { NUDGE_DISPATCH_QUEUE, type NudgeReason } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';

interface NudgeRow {
  id: string;
  sender_id: string;
  target_id: string;
  crew_id: string;
  trip_id: string | null;
  reason: NudgeReason;
  scheduled_delivery_id: string | null;
}

export async function dispatchNudge(
  pool: pg.Pool,
  nudgeId: string,
  now: Date = new Date(),
): Promise<'sent' | 'already_sent' | 'missing'> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<NudgeRow>(
      `UPDATE nudges SET sent_at = $2 WHERE id = $1 AND sent_at IS NULL
       RETURNING id, sender_id, target_id, crew_id, trip_id, reason, scheduled_delivery_id`,
      [nudgeId, now],
    );
    const nudge = rows[0];
    if (nudge === undefined) {
      const exists = await tx.query('SELECT 1 FROM nudges WHERE id = $1', [nudgeId]);
      return (exists.rowCount ?? 0) > 0 ? 'already_sent' : 'missing';
    }
    if (nudge.scheduled_delivery_id !== null) {
      await tx.query(`UPDATE scheduled_deliveries SET status = 'sent' WHERE id = $1`, [
        nudge.scheduled_delivery_id,
      ]);
    }
    await appendDomainEvent(tx, {
      type: 'nudge.received',
      aggregateKind: 'nudge',
      aggregateId: nudge.id,
      actorKind: 'system',
      actorId: null,
      payload: {
        nudge_id: nudge.id,
        sender_id: nudge.sender_id,
        target_id: nudge.target_id,
        crew_id: nudge.crew_id,
        reason: nudge.reason,
      },
      crewId: nudge.crew_id,
      ...(nudge.trip_id === null ? {} : { tripId: nudge.trip_id }),
    });
    return 'sent';
  });
}

export function nudgeDispatchJob(): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: NUDGE_DISPATCH_QUEUE,
    schema: scheduledJobDataSchema,
    singletonKey: (data: ScheduledJobData) => data.ref_id,
    handler: async (data, ctx) => ({ outcome: await dispatchNudge(ctx.pool, data.ref_id) }),
  });
}
