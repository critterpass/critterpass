/**
 * `request_account_deletion` (3n-10, docs/api-contracts.md §4.1): closes the caller's account at
 * once and schedules the purge (docs/api-contracts-you.md has the full contract; the web deletion
 * page calls this same command after sign-in, with `source: web`).
 *
 * The database side (status, deletion row, organiser hand-over, push, location, action keys,
 * realtime disconnect, confirmation mail) commits with the command. Better Auth then ends every
 * session and the Apple/Google tokens are revoked; a revoke that fails is recorded on the
 * deletion row for the console and never blocks the close.
 */
import { requestAccountDeletionPayloadSchema, type AccountDeletionResult } from '@cp/domain';

import type { AccountAuthControl } from '../../account/auth-control';
import { closeAccount } from '../../account/close';
import { asSystemRole } from '../../admin/command';
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
        { reason: payload.reason, note: payload.note, source: payload.source },
        ctx.clock.serverNow,
      );
      const contact = await control.contact(ctx.uid);
      if (!closed.instant) {
        const revokeError = await control.revokeProviders(ctx.uid);
        if (revokeError !== null) {
          await asSystemRole(tx, () =>
            tx.query('UPDATE account_deletions SET provider_revoke_error = $2 WHERE id = $1', [
              closed.deletionId,
              revokeError,
            ]),
          );
        }
      }
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
