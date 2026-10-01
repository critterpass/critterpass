/**
 * `stop_help_share {share_id}` (3k-6 STOP, N-25 STOP_SHARE): the owner ends their Help share now and
 * the Help session with it. Stopping a share that already ended answers its end; the expiry timer
 * finds it ended early and stays quiet.
 */
import { DomainError, stopHelpSharePayloadSchema, type HelpShareWindowResult } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { asSystem, emit, firstRow, tripCrew } from './shared';

interface ShareRow {
  trip_id: string;
  ends_at: Date;
  open: boolean;
  session_id: string | null;
}

export const stopHelpShareCommand = defineCommand({
  name: 'stop_help_share',
  v: 1,
  schema: stopHelpSharePayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'sos',
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<HelpShareWindowResult> => {
    const { rows } = await tx.query<ShareRow>(
      `SELECT l.trip_id, l.ends_at, l.ends_at > now() AS open,
              (SELECT s.id FROM help_sessions s WHERE s.share_id = l.id LIMIT 1) AS session_id
         FROM location_shares l
        WHERE l.id = $1 AND l.user_id = $2 AND l.reason = 'help'`,
      [payload.share_id, ctx.uid],
    );
    const share = rows[0];
    if (share === undefined) throw new DomainError('NOT_FOUND', { reason: 'share' });
    if (!share.open) return { share_id: payload.share_id, ends_at: share.ends_at.toISOString() };
    const ended = await tx.query<{ ends_at: Date }>(
      `UPDATE location_shares SET ends_at = greatest(now(), starts_at + interval '1 millisecond')
        WHERE id = $1 RETURNING ends_at`,
      [payload.share_id],
    );
    const endsAt = firstRow(ended.rows, 'share end').ends_at;
    if (share.session_id !== null) {
      await asSystem(
        tx,
        `UPDATE help_sessions SET status = 'resolved', resolved_at = now(), resolved_by = $2
          WHERE id = $1 AND kind = 'help' AND status <> 'resolved'`,
        [share.session_id, ctx.uid],
      );
      await emit(tx, {
        type: 'help_share.stopped',
        aggregateKind: 'help_session',
        aggregateId: share.session_id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: await tripCrew(tx, share.trip_id),
        tripId: share.trip_id,
        payload: {
          trip_id: share.trip_id,
          share_id: payload.share_id,
          session_id: share.session_id,
        },
      });
    }
    return { share_id: payload.share_id, ends_at: endsAt.toISOString() };
  },
});
