/**
 * `help.share_ending`: ten minutes before a Help share ends, the sharer is reminded and may stop it
 * or share for longer (`help_share.ending` → push `location_share_ending`). A share stopped, ended
 * or extended since this reminder was armed is left alone: the reminder for its new end comes on
 * its own.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import { helpShareEndingJobSchema, SAFETY_QUEUES } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export async function remindHelpShareEnding(
  pool: pg.Pool,
  shareId: string,
  endsAt: string,
  now: Date = new Date(),
): Promise<{ readonly reminded: boolean }> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      trip_id: string;
      crew_id: string;
      user_id: string;
      ends_at: Date | null;
      session_id: string | null;
    }>(
      `SELECT l.trip_id, t.crew_id, l.user_id, l.ends_at, s.id AS session_id
         FROM location_shares l
         JOIN trips t ON t.id = l.trip_id
         LEFT JOIN help_sessions s
           ON s.share_id = l.id AND s.kind = 'help' AND s.status <> 'resolved'
        WHERE l.id = $1 AND l.reason = 'help'`,
      [shareId],
    );
    const share = rows[0];
    if (share?.ends_at == null || share.session_id === null) return { reminded: false };
    if (share.ends_at.getTime() !== Date.parse(endsAt)) return { reminded: false };
    if (share.ends_at.getTime() <= now.getTime()) return { reminded: false };
    // A retried job reminds once per end.
    const already = await tx.query(
      `SELECT 1 FROM domain_events
        WHERE type = 'help_share.ending' AND payload->>'share_id' = $1
          AND (payload->>'ends_at')::timestamptz = $2`,
      [shareId, share.ends_at],
    );
    if ((already.rowCount ?? 0) > 0) return { reminded: false };
    await appendDomainEvent(tx, {
      type: 'help_share.ending',
      aggregateKind: 'help_session',
      aggregateId: share.session_id,
      actorKind: 'system',
      actorId: null,
      crewId: share.crew_id,
      tripId: share.trip_id,
      payload: {
        trip_id: share.trip_id,
        share_id: shareId,
        session_id: share.session_id,
        ends_at: share.ends_at.toISOString(),
      },
    });
    return { reminded: true };
  });
}

export function helpShareEndingJob(): AnyJobDefinition {
  return defineJob({
    queue: SAFETY_QUEUES.helpShareEnding,
    schema: helpShareEndingJobSchema,
    async handler(data, { pool }) {
      return { ...(await remindHelpShareEnding(pool, data.share_id, data.ends_at)) };
    },
  });
}
