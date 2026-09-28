/**
 * `invites.nudge` (hourly): an in-app crew invite to someone already on CritterPass that is still
 * unanswered after a day gets exactly one nudge push, and only when the invitee has the app
 * installed (a registered device). People who are not on CritterPass are never messaged by us: the
 * inviter nudges them through their own share sheet.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export const NUDGE_AFTER_HOURS = 24;

export async function nudgeInvitees(pool: pg.Pool, now: Date = new Date()): Promise<number> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      crew_id: string;
      trip_id: string | null;
      invitee_user_id: string;
    }>(
      `UPDATE invites i SET nudged_at = $1
        WHERE i.status = 'pending' AND i.nudged_at IS NULL AND i.invitee_user_id IS NOT NULL
          AND i.created_at <= $1::timestamptz - make_interval(hours => $2)
          AND i.expires_at > $1
          AND EXISTS (SELECT 1 FROM devices d WHERE d.user_id = i.invitee_user_id)
        RETURNING i.id, i.crew_id, i.trip_id, i.invitee_user_id`,
      [now, NUDGE_AFTER_HOURS],
    );
    for (const row of rows) {
      await appendDomainEvent(tx, {
        type: 'invite.nudged',
        aggregateKind: 'invite',
        aggregateId: row.id,
        actorKind: 'system',
        actorId: null,
        payload: {
          invite_id: row.id,
          crew_id: row.crew_id,
          trip_id: row.trip_id,
          invitee_user_id: row.invitee_user_id,
        },
        crewId: row.crew_id,
      });
    }
    return rows.length;
  });
}

export function inviteNudgeJob(): AnyJobDefinition {
  return defineJob({
    queue: 'invites.nudge',
    schema: z.object({}).nullish(),
    async handler(_data, { pool }) {
      return { nudged: await nudgeInvitees(pool) };
    },
  });
}
