/**
 * `record_app_open{hour_local}` (docs/api-contracts.md §4.3, doc delta): fire-and-forget from the
 * app coming to the foreground. Counts at most one open per local hour per 50 minutes, so a user
 * flicking in and out does not outweigh a habit; the nudge send time reads these counts.
 */
import { recordAppOpenPayloadSchema } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';

/** A second open inside this window, in the same local hour, counts nothing. */
export const APP_OPEN_THROTTLE_MINUTES = 50;

export const recordAppOpenCommand = defineCommand({
  name: 'record_app_open',
  v: 1,
  schema: recordAppOpenPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<{ counted: boolean }> => {
    const now = ctx.clock.serverNow;
    const { rowCount } = await tx.query(
      `INSERT INTO app_open_hours AS h (user_id, hour_local, opens, updated_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (user_id, hour_local) DO UPDATE SET opens = h.opens + 1, updated_at = $3
         WHERE h.updated_at <= $3 - make_interval(mins => $4)`,
      [ctx.uid, payload.hour_local, now, APP_OPEN_THROTTLE_MINUTES],
    );
    return { counted: (rowCount ?? 0) > 0 };
  },
});
