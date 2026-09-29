/**
 * `availability_ask.timeout` (docs/api-contracts-async.md §2.2): the `scheduled_events` timer armed
 * 48 hours after the guide's private ask. An ask still open then times out: its option shows
 * "timed out" (the crew falls back to the best partial week) and whoever asked hears so (N-46).
 * An ask answered in time, or a replayed timer, changes nothing.
 */
import {
  appendDomainEvent,
  outbox,
  scheduledJobDataSchema,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import { channelName, SETUP_QUEUES, SETUP_RT } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';

export async function timeOutAsk(
  pool: pg.Pool,
  askId: string,
  now: Date = new Date(),
): Promise<'timed_out' | 'not_open' | 'not_due'> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      trip_id: string;
      option_id: string | null;
      target_user_id: string;
    }>(
      `UPDATE availability_asks SET status = 'timed_out', reply_text = NULL
        WHERE id = $1 AND status = 'asked' AND expires_at <= $2
       RETURNING trip_id, option_id, target_user_id`,
      [askId, now],
    );
    const ask = rows[0];
    if (ask === undefined) {
      const open = await tx.query(
        "SELECT 1 FROM availability_asks WHERE id = $1 AND status = 'asked'",
        [askId],
      );
      return (open.rowCount ?? 0) > 0 ? 'not_due' : 'not_open';
    }
    if (ask.option_id !== null) {
      await tx.query(
        "UPDATE date_window_options SET ask_status = 'timed_out' WHERE id = $1 AND ask_user_id = $2",
        [ask.option_id, ask.target_user_id],
      );
      await outbox(tx, channelName('trip_setup', ask.trip_id), SETUP_RT.askStatus, {
        option_id: ask.option_id,
        status: 'timed_out',
      });
    }
    await appendDomainEvent(tx, {
      type: 'availability_ask.timed_out',
      aggregateKind: 'availability_ask',
      aggregateId: askId,
      actorKind: 'system',
      actorId: null,
      tripId: ask.trip_id,
      payload: { trip_id: ask.trip_id, ask_id: askId, target_user_id: ask.target_user_id },
    });
    return 'timed_out';
  });
}

export function availabilityAskTimeoutJob(): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: SETUP_QUEUES.askTimeout,
    schema: scheduledJobDataSchema,
    singletonKey: (data) => data.ref_id,
    handler: async (data, ctx) => ({ outcome: await timeOutAsk(ctx.pool, data.ref_id) }),
  });
}
