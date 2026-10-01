/**
 * `request_account_deletion` (3n-10, docs/api-contracts.md §4.1): closes the caller's account at
 * once and schedules the purge (docs/api-contracts-you.md has the full contract; the web deletion
 * page calls this same command after sign-in, with `source: web`).
 *
 * The database side (status, deletion row, organiser hand-over, push, location, action keys,
 * realtime disconnect) commits with the command. Better Auth then ends every session and the
 * Apple/Google tokens are revoked; a revoke that fails never blocks the close.
 */
import { requestAccountDeletionPayloadSchema, type AccountDeletionResult } from '@cp/domain';

import type { AccountAuthControl } from '../../account/auth-control';
import { closeAccount } from '../../account/close';
import { defineCommand } from '../_framework/define-command';

export function createRequestAccountDeletionCommand(control: AccountAuthControl) {
  return defineCommand({
    name: 'request_account_deletion',
    v: 1,
    schema: requestAccountDeletionPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: () => Promise.resolve(),
    handle: async (tx, payload, ctx): Promise<AccountDeletionResult> => {
      const closed = await closeAccount(
        tx,
        ctx.uid,
        { reason: payload.reason, source: payload.source },
        ctx.clock.serverNow,
      );
      const contact = await control.contact(ctx.uid);
      if (!closed.instant) await control.revokeProviders(ctx.uid);
      // Last: once sessions are gone the caller is signed out everywhere, this request included.
      await control.endSessions(ctx.uid);
      return {
        deletion_id: closed.deletionId,
        requested_at: closed.requestedAt.toISOString(),
        purge_at: closed.purgeAt.toISOString(),
        instant: closed.instant,
        contact,
      };
    },
  });
}
