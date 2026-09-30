/**
 * `revoke_calendar_feed` (doc delta): ends every live subscribe link of the caller on the trip;
 * the feed answers 404 from then on. Revoking with nothing live changes nothing.
 */
import { calendarFeedPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { requireTripMember } from '../../plan/access';
import { defineCommand } from '../_framework/define-command';

export const revokeCalendarFeedCommand = defineCommand({
  name: 'revoke_calendar_feed',
  v: 1,
  schema: calendarFeedPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireTripMember(tx, payload.trip_id);
  },
  handle: async (tx, payload, ctx): Promise<{ trip_id: string; revoked: number }> => {
    const { rowCount } = await asSystemRole(tx, () =>
      tx.query(
        `UPDATE calendar_feed_tokens SET revoked_at = $3
          WHERE trip_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [payload.trip_id, ctx.uid, ctx.clock.serverNow],
      ),
    );
    return { trip_id: payload.trip_id, revoked: rowCount ?? 0 };
  },
});
