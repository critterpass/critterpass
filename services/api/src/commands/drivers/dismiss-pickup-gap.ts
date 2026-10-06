/**
 * `dismiss_pickup_gap {trip_id, date}` (offline): NOT NOW on a day's driver card. The card folds to
 * a NO RIDE flag for the caller only; a replay is a no-op.
 */
import { dismissPickupGapPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireMember } from './shared';

export const dismissPickupGapCommand = defineCommand({
  name: 'dismiss_pickup_gap',
  v: 1,
  schema: dismissPickupGapPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireMember(tx, payload.trip_id);
  },
  handle: async (tx, payload, ctx) => {
    await asSystemRole(tx, () =>
      tx.query(
        `INSERT INTO pickup_gap_dismissals (trip_id, user_id, day_date) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, trip_id, day_date) DO NOTHING`,
        [payload.trip_id, ctx.uid, payload.date],
      ),
    );
    return { date: payload.date };
  },
});
