/**
 * `help.share_expire`: runs at a Help share's `ends_at` (re-armed by every extend). The share has
 * already stopped showing (`app.can_see_location` ends at `ends_at`); this closes its Help session,
 * tells the sharer's app on `user:#uid` so its indicator turns off, and records the expiry. A share
 * that was extended past now, or stopped by hand (session already resolved), is left alone.
 */
import { appendDomainEvent, outbox, withSystem } from '@cp/db';
import { helpShareExpireJobSchema, SAFETY_QUEUES, userChannel } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

interface ShareRow {
  trip_id: string;
  crew_id: string;
  user_id: string;
  reason: string;
  ends_at: Date | null;
  session_id: string | null;
  session_status: string | null;
}

export interface HelpShareExpireResult {
  readonly expired: boolean;
  readonly purged: number;
}

export function expireHelpShare(
  pool: pg.Pool,
  shareId: string,
  now: Date = new Date(),
): Promise<HelpShareExpireResult> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<ShareRow>(
      `SELECT l.trip_id, t.crew_id, l.user_id, l.reason, l.ends_at, s.id AS session_id,
              s.status AS session_status
         FROM location_shares l
         JOIN trips t ON t.id = l.trip_id
         LEFT JOIN help_sessions s ON s.share_id = l.id AND s.kind = 'help'
        WHERE l.id = $1 FOR UPDATE OF l`,
      [shareId],
    );
    const share = rows[0];
    if (share?.reason !== 'help' || share.ends_at === null) return { expired: false, purged: 0 };
    if (share.ends_at.getTime() > now.getTime()) return { expired: false, purged: 0 };
    const purged = await tx.query('DELETE FROM location_fixes WHERE share_id = $1', [shareId]);
    if (share.session_id === null || share.session_status === 'resolved') {
      return { expired: false, purged: purged.rowCount ?? 0 };
    }
    await tx.query(
      `UPDATE help_sessions SET status = 'resolved', resolved_at = $2
        WHERE id = $1 AND status <> 'resolved'`,
      [share.session_id, share.ends_at],
    );
    await outbox(tx, userChannel(share.user_id), 'help.share_ended', {
      share_id: shareId,
      session_id: share.session_id,
      reason: 'window_ended',
    });
    await appendDomainEvent(tx, {
      type: 'help_share.expired',
      aggregateKind: 'help_session',
      aggregateId: share.session_id,
      actorKind: 'system',
      actorId: null,
      crewId: share.crew_id,
      tripId: share.trip_id,
      payload: { trip_id: share.trip_id, share_id: shareId, session_id: share.session_id },
    });
    return { expired: true, purged: purged.rowCount ?? 0 };
  });
}

export function helpShareExpireJob(): AnyJobDefinition {
  return defineJob({
    queue: SAFETY_QUEUES.helpShareExpire,
    schema: helpShareExpireJobSchema,
    async handler(data, { pool }) {
      return { ...(await expireHelpShare(pool, data.share_id)) };
    },
  });
}
