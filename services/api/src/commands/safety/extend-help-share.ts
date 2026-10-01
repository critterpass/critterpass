/**
 * `extend_help_share {share_id, ttl_min?}` (3k-6 +1 H): the owner keeps sharing for another hour
 * from the later of now and the current end, never more than three hours ahead. An ended share
 * cannot be extended (`STATE_INVALID share_ended`): the app offers a new one instead.
 */
import {
  DomainError,
  extendedHelpShareEnd,
  extendHelpSharePayloadSchema,
  HELP_SHARE_EXTEND_MIN,
  type HelpShareWindowResult,
} from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { armHelpShareExpiry, emit, tripCrew } from './shared';

export const extendHelpShareCommand = defineCommand({
  name: 'extend_help_share',
  v: 1,
  schema: extendHelpSharePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<HelpShareWindowResult> => {
    const { rows } = await tx.query<{ trip_id: string; ends_at: Date; session_id: string | null }>(
      `SELECT l.trip_id, l.ends_at,
              (SELECT s.id FROM help_sessions s WHERE s.share_id = l.id LIMIT 1) AS session_id
         FROM location_shares l
        WHERE l.id = $1 AND l.user_id = $2 AND l.reason = 'help' FOR UPDATE`,
      [payload.share_id, ctx.uid],
    );
    const share = rows[0];
    if (share === undefined) throw new DomainError('NOT_FOUND', { reason: 'share' });
    const now = ctx.clock.serverNow;
    if (share.ends_at.getTime() <= now.getTime()) {
      throw new DomainError('STATE_INVALID', { reason: 'share_ended' });
    }
    const endsAt = extendedHelpShareEnd(
      share.ends_at,
      now,
      payload.ttl_min ?? HELP_SHARE_EXTEND_MIN,
    );
    await tx.query('UPDATE location_shares SET ends_at = $2 WHERE id = $1', [
      payload.share_id,
      endsAt,
    ]);
    await armHelpShareExpiry(tx, payload.share_id, endsAt);
    if (share.session_id !== null) {
      await emit(tx, {
        type: 'help_share.extended',
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
          ends_at: endsAt.toISOString(),
        },
      });
    }
    return { share_id: payload.share_id, ends_at: endsAt.toISOString() };
  },
});
