/**
 * Device action key revocation (docs/api-contracts-async.md §5: "revoked on sign-out, device
 * removal, deletion, uid merge, or admin action"). Always a soft revoke (`revoked_at`), never a
 * DELETE: `device_action_keys` grants no role DELETE (packages/db/migrations/*_device_action_keys
 * .sql), so a revoked row stays auditable for its retention window. Merge's own revocation runs
 * through `packages/db/src/merge-rules.ts`'s registered rule instead of these helpers (same
 * transaction as the rest of the merge); sign-out, device removal, account deletion and admin
 * actions (this phase's `guards.ts`, and later phases' device/account routes) call these directly.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';

export async function revokeActionKey(pool: pg.Pool, keyId: string): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      'UPDATE device_action_keys SET revoked_at = now() WHERE key_id = $1 AND revoked_at IS NULL',
      [keyId],
    ),
  );
}

export async function revokeActionKeysForUser(pool: pg.Pool, userId: string): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      'UPDATE device_action_keys SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    ),
  );
}

export async function revokeActionKeysForDevice(pool: pg.Pool, deviceId: string): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      'UPDATE device_action_keys SET revoked_at = now() WHERE device_id = $1 AND revoked_at IS NULL',
      [deviceId],
    ),
  );
}
