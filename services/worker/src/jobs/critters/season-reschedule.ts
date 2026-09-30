/**
 * `reminders.reschedule` (daily, after the overnight content and season runs): a legendary window
 * a new release moved gets its pending reminders moved with it — the timer re-armed a month before
 * the new start, in the traveller's zone — and a window that no longer opens (removed, or now any
 * day) cancels them. Unchanged windows are left alone.
 */
import { cancelScheduledEvent, scheduleEvent, withSystem } from '@cp/db';
import {
  CRITTER_QUEUES,
  legendaryReminderFireDate,
  nextWindowSpan,
  REMINDER_TIMER_KIND,
  reminderConditionSchema,
  toLocalWallTime,
  windowRuleSchema,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

interface PendingRow {
  readonly id: string;
  readonly condition: unknown;
  readonly rule: unknown;
}

export async function rescheduleLegendaryReminders(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<{ readonly moved: number; readonly cancelled: number }> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<PendingRow>(
      `SELECT r.id, r.condition, w.rule FROM reminders r
         LEFT JOIN legendary_windows w ON w.id = r.target_id
        WHERE r.target_kind = 'legendary' AND r.status = 'pending'
        ORDER BY r.id`,
    );
    let moved = 0;
    let cancelled = 0;
    for (const row of rows) {
      const condition = reminderConditionSchema.safeParse(row.condition);
      if (!condition.success || condition.data.kind !== 'window_active_not_found') continue;
      const tz = condition.data.tz;
      const today = toLocalWallTime(now, tz).date;
      const rule = windowRuleSchema.safeParse(row.rule);
      const span = rule.success ? nextWindowSpan(rule.data, today) : null;
      if (span === null) {
        await tx.query("UPDATE reminders SET status = 'cancelled' WHERE id = $1", [row.id]);
        await cancelScheduledEvent(tx, { kind: REMINDER_TIMER_KIND, refId: row.id });
        cancelled += 1;
        continue;
      }
      if (span.start === condition.data.window_start) continue;
      const fireDate = legendaryReminderFireDate(span.start, today);
      const timerId = await scheduleEvent(tx, {
        kind: REMINDER_TIMER_KIND,
        refId: row.id,
        tz,
        local: { date: fireDate, time: '09:00' },
      });
      await tx.query(
        `UPDATE reminders
            SET condition = jsonb_set(condition, '{window_start}', to_jsonb($2::text)),
                fire_at = (SELECT due_at FROM scheduled_events WHERE id = $3)
          WHERE id = $1`,
        [row.id, span.start, timerId],
      );
      moved += 1;
    }
    return { moved, cancelled };
  });
}

export function seasonRescheduleJob(): AnyJobDefinition {
  return defineJob({
    queue: CRITTER_QUEUES.remindersReschedule,
    schema: z.object({}).nullish(),
    async handler(_data, { pool }) {
      return { ...(await rescheduleLegendaryReminders(pool)) };
    },
  });
}
