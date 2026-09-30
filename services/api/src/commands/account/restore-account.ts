/**
 * `restore_account` (3n-11 UNDO and the restore interstitial, docs/api-contracts.md §4.1): within
 * the grace window, reopens a closed account exactly as it was. The only command a closed account
 * may run (services/api/src/account/closed-guard.ts).
 */
import { restoreAccountPayloadSchema } from '@cp/domain';

import { restoreAccount } from '../../account/close';
import { defineCommand } from '../_framework/define-command';

export const restoreAccountCommand = defineCommand({
  name: 'restore_account',
  v: 1,
  schema: restoreAccountPayloadSchema,
  offline: false,
  authorize: () => Promise.resolve(),
  handle: async (tx, _payload, ctx): Promise<{ deletion_id: string; status: 'registered' }> => {
    const { deletionId } = await restoreAccount(tx, ctx.uid, ctx.clock.serverNow);
    return { deletion_id: deletionId, status: 'registered' };
  },
});
