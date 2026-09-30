/**
 * `reminders.conditional`: a reminder's timer came due. It fires only while its condition holds
 * (./conditions.ts): the reminder is marked fired and, for a legendary window, the traveller hears
 * N-30 through `legendary.reminder_due` (the device may already have shown its local copy). A
 * condition that no longer holds cancels the reminder silently.
 */
import { appendDomainEvent, scheduledJobDataSchema, withSystem } from '@cp/db';
import { CRITTER_QUEUES, reminderConditionSchema } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import { conditionHolds } from './conditions';

export type ReminderOutcome = 'fired' | 'cancelled' | 'gone';

export async function fireReminder(
  pool: pg.Pool,
  reminderId: string,
  now: Date = new Date(),
): Promise<ReminderOutcome> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      user_id: string;
      target_kind: string;
      target_id: string;
      condition: unknown;
    }>(
      `SELECT user_id, target_kind, target_id, condition FROM reminders
        WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [reminderId],
    );
    const reminder = rows[0];
    if (reminder === undefined) return 'gone';
    const condition = reminderConditionSchema.safeParse(reminder.condition);
    const holds =
      condition.success &&
      (await conditionHolds(tx, condition.data, { userId: reminder.user_id, now }));
    if (!holds) {
      await tx.query("UPDATE reminders SET status = 'cancelled' WHERE id = $1", [reminderId]);
      return 'cancelled';
    }
    await tx.query("UPDATE reminders SET status = 'fired', fired_at = $2 WHERE id = $1", [
      reminderId,
      now,
    ]);
    if (reminder.target_kind === 'legendary') {
      await appendDomainEvent(tx, {
        type: 'legendary.reminder_due',
        aggregateKind: 'reminder',
        aggregateId: reminderId,
        actorKind: 'system',
        actorId: null,
        payload: {
          user_id: reminder.user_id,
          window_id: reminder.target_id,
          reminder_id: reminderId,
        },
      });
    }
    return 'fired';
  });
}

export function conditionalReminderJob(): AnyJobDefinition {
  return defineJob({
    queue: CRITTER_QUEUES.remindersConditional,
    schema: scheduledJobDataSchema,
    singletonKey: (data) => data.ref_id,
    async handler(data, { pool }) {
      return { outcome: await fireReminder(pool, data.ref_id) };
    },
  });
}
