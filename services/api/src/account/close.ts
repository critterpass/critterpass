/**
 * Closing and restoring an account (3n-10, 3n-11; docs/api-contracts.md §4.1): everything that
 * happens inside the command's own transaction. Closing marks the user `closed`, opens the
 * deletion row with its balances snapshot and purge date, hands open trips to a successor, stops
 * live location and silences push (tokens are parked, not deleted, so a restore brings them back).
 * Ending the sessions, which also revokes device action keys and disconnects realtime, is the
 * caller's next step (`AccountAuthControl.endSessions`). An account nobody can sign back into has
 * nothing to restore: its purge is queued at once. Restoring within the grace window undoes the
 * close; memberships, trips and data were never touched.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import {
  ACCOUNT_QUEUES,
  DELETION_GRACE_DAYS,
  DomainError,
  type AccountPurgeJob,
  type DeletionReason,
  type DeletionSource,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { crewBalances } from './balances';
import { transferOrganiserRoles } from './organiser-transfer';

const DAY_MS = 86_400_000;
export const PUSH_PARKED_REASON = 'account_closed';

export interface CloseInput {
  readonly reason: DeletionReason | undefined;
  readonly source: DeletionSource;
}

export interface ClosedAccount {
  readonly deletionId: string;
  readonly requestedAt: Date;
  readonly purgeAt: Date;
  readonly instant: boolean;
}

export async function closeAccount(
  tx: pg.PoolClient,
  uid: string,
  input: CloseInput,
  now: Date,
): Promise<ClosedAccount> {
  return asSystemRole(tx, async () => {
    const { rows } = await tx.query<{ status: string }>(
      'SELECT status FROM users WHERE id = $1 FOR UPDATE',
      [uid],
    );
    const status = rows[0]?.status;
    if (status === undefined) throw new DomainError('NOT_FOUND', { reason: 'no_profile' });
    if (status === 'closed' || status === 'purged') throw new DomainError('ACCOUNT_CLOSED');
    const identity = await tx.query<{ has: boolean }>(
      'SELECT app.account_has_identity($1) AS has',
      [uid],
    );
    const instant = identity.rows[0]?.has !== true;
    const purgeAt = instant ? now : new Date(now.getTime() + DELETION_GRACE_DAYS * DAY_MS);

    const snapshot = await crewBalances(tx, uid);
    const inserted = await tx.query<{ id: string; requested_at: Date }>(
      `INSERT INTO account_deletions (user_id, reason, balances_snapshot, purge_at, source)
       VALUES ($1, $2, $3::jsonb, $4, $5) RETURNING id, requested_at`,
      [
        uid,
        input.reason ?? null,
        JSON.stringify(
          snapshot.map((b) => ({ crew_id: b.crewId, currency: b.currency, net_minor: b.netMinor })),
        ),
        purgeAt,
        input.source,
      ],
    );
    const deletion = inserted.rows[0];
    if (deletion === undefined) throw new Error('account_deletions insert returned no row');

    await tx.query("UPDATE users SET status = 'closed', purge_at = $2 WHERE id = $1", [
      uid,
      purgeAt,
    ]);
    await transferOrganiserRoles(tx, uid);
    await tx.query(
      `UPDATE location_shares SET ends_at = GREATEST(now(), starts_at + interval '1 second')
        WHERE user_id = $1 AND (ends_at IS NULL OR ends_at > now())`,
      [uid],
    );
    await tx.query(
      `UPDATE push_tokens SET invalid_at = now(), invalid_reason = $2
        WHERE invalid_at IS NULL AND device_id IN (SELECT id FROM devices WHERE user_id = $1)`,
      [uid, PUSH_PARKED_REASON],
    );
    await appendDomainEvent(tx, {
      type: 'account.closed',
      aggregateKind: 'user',
      aggregateId: uid,
      actorKind: 'user',
      actorId: uid,
      payload: { user_id: uid, deletion_id: deletion.id, instant, source: input.source },
    });
    if (instant) {
      const job: AccountPurgeJob = { user_id: uid };
      await sendInTx(tx, ACCOUNT_QUEUES.purge, job, { singletonKey: `purge:${uid}` });
    }
    return { deletionId: deletion.id, requestedAt: deletion.requested_at, purgeAt, instant };
  });
}

export async function restoreAccount(
  tx: pg.PoolClient,
  uid: string,
  now: Date,
): Promise<{ readonly deletionId: string; readonly status: 'anonymous' | 'registered' }> {
  return asSystemRole(tx, async () => {
    const { rows } = await tx.query<{ id: string; purge_at: Date }>(
      `SELECT id, purge_at FROM account_deletions
        WHERE user_id = $1 AND restored_at IS NULL AND purged_at IS NULL FOR UPDATE`,
      [uid],
    );
    const open = rows[0];
    if (open === undefined) throw new DomainError('STATE_INVALID', { reason: 'not_closed' });
    if (open.purge_at.getTime() <= now.getTime()) {
      throw new DomainError('STATE_INVALID', { reason: 'grace_over' });
    }
    await tx.query('UPDATE account_deletions SET restored_at = $2 WHERE id = $1', [open.id, now]);
    const reopened = await tx.query<{ status: 'anonymous' | 'registered' }>(
      `UPDATE users SET status = app.account_open_status($1), purge_at = NULL
        WHERE id = $1 AND status = 'closed' RETURNING status`,
      [uid],
    );
    const status = reopened.rows[0]?.status;
    if (status === undefined) throw new DomainError('STATE_INVALID', { reason: 'not_closed' });
    await tx.query(
      `UPDATE push_tokens SET invalid_at = NULL, invalid_reason = NULL
        WHERE invalid_reason = $2 AND device_id IN (SELECT id FROM devices WHERE user_id = $1)`,
      [uid, PUSH_PARKED_REASON],
    );
    await appendDomainEvent(tx, {
      type: 'account.restored',
      aggregateKind: 'user',
      aggregateId: uid,
      actorKind: 'user',
      actorId: uid,
      payload: { user_id: uid, deletion_id: open.id },
    });
    return { deletionId: open.id, status };
  });
}
