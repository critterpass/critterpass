/**
 * `set_legendary_reminder` (REMIND ME on 3l-9): a reminder a month before the legendary's next
 * window opens, at 09:00 in the traveller's zone, which fires only if the window still opens then
 * and the form is still unfound (`reminders.conditional`). Turning it off cancels the timer. A
 * window less than a month away reminds the next morning; an any-day challenge has nothing to wait
 * for and is refused.
 */
import { appendDomainEvent, cancelScheduledEvent, scheduleEvent } from '@cp/db';
import {
  DomainError,
  LEGENDARY_REMINDER_LEAD_DAYS,
  legendaryReminderFireDate,
  nextWindowSpan,
  REMINDER_TIMER_KIND,
  setLegendaryReminderPayloadSchema,
  toLocalWallTime,
  windowRuleSchema,
  type SetLegendaryReminderPayload,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

interface WindowRow {
  readonly id: string;
  readonly form_id: string;
  readonly rule: unknown;
}

async function windowRow(tx: pg.PoolClient, id: string): Promise<WindowRow> {
  const { rows } = await tx.query<WindowRow>(
    'SELECT id, form_id, rule FROM legendary_windows WHERE id = $1',
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'window' });
  return row;
}

export const setLegendaryReminderCommand = defineCommand({
  name: 'set_legendary_reminder',
  v: 1,
  schema: setLegendaryReminderPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload: SetLegendaryReminderPayload) => {
    const window = await windowRow(tx, payload.window_id);
    if (payload.on && windowRuleSchema.parse(window.rule).type === 'any_day') {
      throw new DomainError('VALIDATION', { reason: 'window_always_open' });
    }
  },
  handle: async (tx, payload, ctx) => {
    const window = await windowRow(tx, payload.window_id);
    const tz = ctx.device.tz;
    const result = await asSystemRole(tx, async () => {
      if (!payload.on) {
        const { rows } = await tx.query<{ id: string }>(
          `UPDATE reminders SET status = 'cancelled'
            WHERE user_id = $1 AND target_kind = 'legendary' AND target_id = $2 AND status = 'pending'
           RETURNING id`,
          [ctx.uid, payload.window_id],
        );
        for (const row of rows) {
          await cancelScheduledEvent(tx, { kind: REMINDER_TIMER_KIND, refId: row.id });
        }
        return { reminder_id: rows[0]?.id ?? null, fire_at: null };
      }
      const today = toLocalWallTime(ctx.clock.serverNow, tz).date;
      const span = nextWindowSpan(windowRuleSchema.parse(window.rule), today);
      if (span === null) throw new DomainError('VALIDATION', { reason: 'window_always_open' });
      const fireDate = legendaryReminderFireDate(span.start, today);
      const condition = {
        kind: 'window_active_not_found',
        window_id: window.id,
        form_id: window.form_id,
        window_start: span.start,
        lead_days: LEGENDARY_REMINDER_LEAD_DAYS,
      };
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO reminders (user_id, target_kind, target_id, fire_at, condition)
         VALUES ($1, 'legendary', $2, now(), $3)
         ON CONFLICT (user_id, target_id) WHERE target_kind = 'legendary' AND status = 'pending'
         DO UPDATE SET condition = EXCLUDED.condition
         RETURNING id`,
        [ctx.uid, window.id, JSON.stringify({ ...condition, tz })],
      );
      const reminderId = rows[0]?.id;
      if (reminderId === undefined) throw new Error('reminder upsert returned no row');
      const timerId = await scheduleEvent(tx, {
        kind: REMINDER_TIMER_KIND,
        refId: reminderId,
        tz,
        local: { date: fireDate, time: '09:00' },
      });
      const { rows: due } = await tx.query<{ due_at: Date }>(
        'SELECT due_at FROM scheduled_events WHERE id = $1',
        [timerId],
      );
      const fireAt = due[0]?.due_at;
      if (fireAt === undefined) throw new Error('scheduled reminder timer not found');
      await tx.query('UPDATE reminders SET fire_at = $2 WHERE id = $1', [reminderId, fireAt]);
      return { reminder_id: reminderId, fire_at: fireAt.toISOString() };
    });
    await appendDomainEvent(tx, {
      type: 'legendary.reminder_set',
      aggregateKind: 'reminder',
      aggregateId: payload.window_id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { user_id: ctx.uid, window_id: payload.window_id, on: payload.on },
    });
    return result;
  },
});
