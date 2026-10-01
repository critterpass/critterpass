/**
 * Erasing the caller's own account at once (`POST /v1/me/deletion/purge-now`), for test devices
 * that need to start again as a brand-new person: the account is closed if it is still open, then
 * purged by the same routine the hourly job runs, in one transaction. Provider tokens are revoked
 * and every session ended, so the request's own session is gone when the answer arrives.
 * Production refuses it: there an account is erased only after its grace window.
 */
import { purgeAccount, withSystem } from '@cp/db';
import { DomainError, type PurgeNowResult } from '@cp/domain';
import type pg from 'pg';

import type { AccountAuthControl } from './auth-control';
import { closeAccount } from './close';

export type AppEnvTier = 'local' | 'staging' | 'production';

export interface PurgeNowDeps {
  readonly pool: pg.Pool;
  readonly control: AccountAuthControl;
  readonly appEnv: AppEnvTier;
  readonly clock?: () => Date;
}

export function assertPurgeNowAllowed(appEnv: AppEnvTier): void {
  if (appEnv === 'production') throw new DomainError('FORBIDDEN', { reason: 'production' });
}

export async function purgeNow(deps: PurgeNowDeps, uid: string): Promise<PurgeNowResult> {
  assertPurgeNowAllowed(deps.appEnv);
  // While the auth rows still exist: after the purge there is nothing left to revoke with.
  await deps.control.revokeProviders(uid).catch(() => null);
  const purged = await withSystem(deps.pool, async (tx) => {
    const { rows } = await tx.query<{ status: string }>(
      'SELECT status FROM users WHERE id = $1 FOR UPDATE',
      [uid],
    );
    const status = rows[0]?.status;
    if (status === undefined) throw new DomainError('NOT_FOUND', { reason: 'no_profile' });
    if (status === 'purged') throw new DomainError('AUTH_REQUIRED', { reason: 'account_purged' });
    if (status !== 'closed') {
      await closeAccount(
        tx,
        uid,
        { reason: undefined, source: 'app' },
        deps.clock?.() ?? new Date(),
      );
    }
    const result = await purgeAccount(tx, uid, { forced: true });
    if (result === null) throw new DomainError('STATE_INVALID', { reason: 'not_closed' });
    return result;
  });
  // The auth rows are gone; this clears the session cache so the old cookie stops working now.
  await deps.control.endSessions(uid).catch(() => undefined);
  return {
    purged: true,
    user_id: uid,
    deletion_id: purged.deletionId,
    purged_at: purged.purgedAt.toISOString(),
  };
}
