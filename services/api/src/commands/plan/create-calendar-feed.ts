/**
 * `create_calendar_feed` (doc delta): a member's subscribe link for their own plan of a trip. The
 * secret is returned once and only its hash is stored; a new link replaces the member's earlier
 * ones on that trip.
 */
import { randomBytes } from 'node:crypto';

import { calendarFeedPath, calendarFeedPayloadSchema, type CalendarFeedIssued } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { requireTripMember } from '../../plan/access';
import { tokenHash } from '../../plan/calendar-feed';
import { defineCommand } from '../_framework/define-command';

export const createCalendarFeedCommand = defineCommand({
  name: 'create_calendar_feed',
  v: 1,
  schema: calendarFeedPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireTripMember(tx, payload.trip_id);
  },
  handle: async (tx, payload, ctx): Promise<CalendarFeedIssued> => {
    const token = randomBytes(32).toString('base64url');
    await asSystemRole(tx, async () => {
      await tx.query(
        `UPDATE calendar_feed_tokens SET revoked_at = $3
          WHERE trip_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [payload.trip_id, ctx.uid, ctx.clock.serverNow],
      );
      await tx.query(
        'INSERT INTO calendar_feed_tokens (trip_id, user_id, token_hash) VALUES ($1, $2, $3)',
        [payload.trip_id, ctx.uid, tokenHash(token)],
      );
    });
    return { trip_id: payload.trip_id, path: calendarFeedPath(payload.trip_id, token) };
  },
});
