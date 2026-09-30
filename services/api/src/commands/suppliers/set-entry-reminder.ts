/**
 * `set_entry_reminder {trip_id, must_do_id, closes_at, results_at?, url}` (3c-7, 3c-9: "Entries
 * close {date}. Each of you enters on the official site — I'll remind you."): every participant of
 * the trip gets a reminder a day before entries close (or at once when that is already past) and,
 * when known, one as results come out. The timers are `setup.lottery_remind`'s, so each participant
 * hears it from the guide with the official link on the must-do. Repeating the command re-arms the
 * same timers and never adds a second reminder. We never enter anyone.
 */
import { appendDomainEvent, scheduleEvent } from '@cp/db';
import {
  DomainError,
  ENTRY_REMINDER_LEAD_MS,
  SETUP_QUEUES,
  setEntryReminderPayloadSchema,
  type SetEntryReminderResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { requireTripParticipant } from '../bookings/shared';
import { tripMoneyMembers } from '../money/shared';
import { defineCommand } from '../_framework/define-command';

export const setEntryReminderCommand = defineCommand({
  name: 'set_entry_reminder',
  v: 1,
  schema: setEntryReminderPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireTripParticipant(tx, payload.trip_id, ctx.uid);
    const { rowCount } = await tx.query(
      'SELECT 1 FROM must_dos WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL',
      [payload.must_do_id, payload.trip_id],
    );
    if (rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'must_do' });
  },
  handle: async (tx, payload, ctx): Promise<SetEntryReminderResult> => {
    const trip = await requireTripParticipant(tx, payload.trip_id, ctx.uid);
    const now = ctx.clock.serverNow;
    const closesAt = new Date(payload.closes_at);
    if (closesAt <= now) throw new DomainError('VALIDATION', { reason: 'entries_closed' });
    const remindAt = new Date(Math.max(closesAt.getTime() - ENTRY_REMINDER_LEAD_MS, now.getTime()));
    const resultsAt = payload.results_at === undefined ? null : new Date(payload.results_at);
    const tz = trip.tz ?? ctx.device.tz;
    const slots = [
      { slot: 'deadline' as const, at: remindAt },
      ...(resultsAt === null ? [] : [{ slot: 'result' as const, at: resultsAt }]),
    ];
    const participants = await tripMoneyMembers(tx, trip.id);
    await asSystemRole(tx, async () => {
      for (const uid of participants) {
        for (const { slot, at } of slots) {
          const known = await tx.query<{ status: string }>(
            `UPDATE reminders SET fire_at = CASE WHEN status = 'pending' THEN $4 ELSE fire_at END
              WHERE user_id = $1 AND target_kind = 'must_do' AND target_id = $2
                AND status IN ('pending', 'fired') AND condition->>'slot' = $3
              RETURNING status`,
            [uid, payload.must_do_id, slot, at],
          );
          // Already reminded for this slot: nothing more.
          if (known.rows.some((row) => row.status === 'fired')) continue;
          if (known.rows.length === 0) {
            await tx.query(
              `INSERT INTO reminders (user_id, target_kind, target_id, fire_at, condition)
               VALUES ($1, 'must_do', $2, $3, $4)`,
              [uid, payload.must_do_id, at, JSON.stringify({ slot, trip_id: trip.id })],
            );
          }
          await scheduleEvent(tx, {
            kind: SETUP_QUEUES.lotteryRemind,
            refId: payload.must_do_id,
            slot: `${uid}:${slot}`,
            tz,
            at,
            data: { user_id: uid, slot },
          });
        }
      }
      await tx.query(
        `UPDATE must_dos SET external_action = 'lottery', external_url = $2,
           external_deadline = ($3::timestamptz AT TIME ZONE $4)::date
         WHERE id = $1`,
        [payload.must_do_id, payload.url, closesAt, tz],
      );
    });
    await appendDomainEvent(tx, {
      type: 'lottery.reminders_set',
      aggregateKind: 'must_do',
      aggregateId: payload.must_do_id,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: trip.crew_id,
      tripId: trip.id,
      payload: {
        trip_id: trip.id,
        must_do_id: payload.must_do_id,
        participants: participants.length,
      },
    });
    return {
      must_do_id: payload.must_do_id,
      participants: participants.length,
      remind_at: remindAt.toISOString(),
      results_at: resultsAt?.toISOString() ?? null,
    };
  },
});
