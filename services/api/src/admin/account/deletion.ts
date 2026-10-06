/**
 * Account deletion in the console (docs/api-contracts.md §4.17): what support sees of a traveller's
 * deletion requests and last data export, the list of deletions by state, and the owner's
 * `force_purge_account` for a legal erasure request.
 *
 * Forcing a purge only ends the grace window: the account must already be closed (its sessions,
 * provider tokens and push tokens went when it closed), and the purge itself is the same hourly
 * job every account goes through, queued here for this account so it runs within the minute. The
 * external stores follow from that job. Reads run as admin_reader and name ids, dates and states.
 */
import { sendInTx } from '@cp/db';
import {
  ACCOUNT_QUEUES,
  accountDeletionState,
  adminAccountDeletionsQuerySchema,
  adminAccountDeletionsResponseSchema,
  adminUserDeletionSchema,
  DomainError,
  forcePurgeAccountPayloadSchema,
  type AccountPurgeJob,
  type AdminAccountDeletion,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { withAdminReader } from '../reads';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from '../registry';

interface DeletionRow {
  id: string;
  user_id: string;
  source: string;
  requested_at: Date;
  purge_at: Date;
  restored_at: Date | null;
  purged_at: Date | null;
}

const DELETION_COLUMNS = 'id, user_id, source, requested_at, purge_at, restored_at, purged_at';
const LIST_LIMIT = 100;

const iso = (value: Date | null) => value?.toISOString() ?? null;

function deletion(row: DeletionRow): AdminAccountDeletion {
  return {
    id: row.id,
    uid: row.user_id,
    state: accountDeletionState(row),
    source: row.source,
    requested_at: row.requested_at.toISOString(),
    purge_at: row.purge_at.toISOString(),
    restored_at: iso(row.restored_at),
    purged_at: iso(row.purged_at),
  };
}

const STATE_FILTER = {
  requested: 'restored_at IS NULL AND purged_at IS NULL',
  restored: 'restored_at IS NOT NULL',
  purged: 'purged_at IS NOT NULL',
} as const;

/** Ends the open deletion's grace window and queues the purge; the result names the deletion. */
export async function forcePurgeAccount(
  tx: pg.PoolClient,
  uid: string,
): Promise<{ deletion_id: string; queued: true }> {
  const { rows } = await tx.query<{ id: string }>(
    `UPDATE account_deletions SET purge_at = now()
      WHERE user_id = $1 AND restored_at IS NULL AND purged_at IS NULL
      RETURNING id`,
    [uid],
  );
  const open = rows[0];
  if (open === undefined) {
    const user = await tx.query('SELECT 1 FROM users WHERE id = $1', [uid]);
    if (user.rowCount === 0) throw new DomainError('NOT_FOUND');
    throw new DomainError('STATE_INVALID', { reason: 'not_closed' });
  }
  await tx.query("UPDATE users SET purge_at = now() WHERE id = $1 AND status = 'closed'", [uid]);
  const job: AccountPurgeJob = { user_id: uid };
  await sendInTx(tx, ACCOUNT_QUEUES.purge, job, { singletonKey: `purge:${uid}` });
  return { deletion_id: open.id, queued: true };
}

export function accountDeletionArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'account_deletion',
    reads: [
      defineAdminRead({
        path: '/users/{uid}/deletion',
        area: 'support',
        summary: "A user's deletion requests (newest first) and their last data export",
        params: z.object({ uid: z.uuid() }),
        response: adminUserDeletionSchema,
        run: ({ admin, params }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const deletions = await tx.query<DeletionRow>(
              `SELECT ${DELETION_COLUMNS} FROM account_deletions
                WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 20`,
              [params.uid],
            );
            const exports = await tx.query<{
              id: string;
              status: string;
              requested_at: Date;
              ready_at: Date | null;
              expires_at: Date | null;
            }>(
              `SELECT id, status, requested_at, ready_at, expires_at FROM data_exports
                WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1`,
              [params.uid],
            );
            const items = deletions.rows.map(deletion);
            const last = exports.rows[0];
            return adminUserDeletionSchema.parse({
              state: items[0]?.state ?? 'none',
              deletions: items,
              last_export:
                last === undefined
                  ? null
                  : {
                      id: last.id,
                      status: last.status,
                      requested_at: last.requested_at.toISOString(),
                      ready_at: iso(last.ready_at),
                      expires_at: iso(last.expires_at),
                    },
            });
          }),
      }),
      defineAdminRead({
        path: '/account-deletions',
        area: 'support',
        summary: 'Deletion requests in one state: soonest purge first, or most recent first',
        query: adminAccountDeletionsQuerySchema,
        response: adminAccountDeletionsResponseSchema,
        run: ({ admin, query }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const order = query.state === 'requested' ? 'purge_at ASC' : 'requested_at DESC';
            const { rows } = await tx.query<DeletionRow>(
              `SELECT ${DELETION_COLUMNS} FROM account_deletions
                WHERE ${STATE_FILTER[query.state]} ORDER BY ${order} LIMIT ${LIST_LIMIT}`,
            );
            return { items: rows.map(deletion) };
          }),
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'force_purge_account',
        schema: forcePurgeAccountPayloadSchema,
        audit: (payload, result: { deletion_id: string }) => ({
          targetKind: 'user',
          targetId: payload.uid,
          reason: payload.reason,
          detail: { deletion_id: result.deletion_id },
        }),
        handle: (tx, payload) => forcePurgeAccount(tx, payload.uid),
      }),
    ],
  });
}
