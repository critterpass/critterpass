/**
 * `watch_boost_lock` (docs/api-contracts.md §4.15): a seated member who found the trip's boost
 * lock held by someone else ("Tell me when it's done") is added to the lock's waiting members.
 * A purchase tells every seated member already; when the lock lapses or its holder lets go, the
 * waiting members hear the trip is free to boost. No lock held any more: `waiting: false`.
 */
import { DomainError, watchBoostLockPayloadSchema, type WatchBoostLockResult } from '@cp/domain';

import { asServer } from '../../billing/as-server';
import { requireMoneyMember } from '../money/shared';
import { defineCommand } from '../_framework/define-command';

export const watchBoostLockCommand = defineCommand({
  name: 'watch_boost_lock',
  v: 1,
  schema: watchBoostLockPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireMoneyMember(tx, payload.trip_id, ctx.uid);
  },
  handle: (tx, payload, ctx): Promise<WatchBoostLockResult> =>
    asServer(tx, async () => {
      const { rows } = await tx.query<{ id: string; buyer_id: string }>(
        `SELECT id, buyer_id FROM boost_intents
          WHERE trip_id = $1 AND status IN ('open', 'purchasing') AND expires_at > $2
          FOR UPDATE`,
        [payload.trip_id, ctx.clock.serverNow],
      );
      const lock = rows[0];
      if (lock === undefined) return { waiting: false };
      if (lock.buyer_id === ctx.uid) throw new DomainError('VALIDATION', { reason: 'own_lock' });
      await tx.query(
        `UPDATE boost_intents SET waiting_uids = array_append(waiting_uids, $2::uuid)
          WHERE id = $1 AND NOT ($2::uuid = ANY (waiting_uids))`,
        [lock.id, ctx.uid],
      );
      return { waiting: true };
    }),
});
