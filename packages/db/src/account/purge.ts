/**
 * Erases one closed account (docs/data-model-sync-and-privacy.md §1 "Deletion"), the same way for
 * the worker's hourly `account.purge` job and the api's own purge route: the statements of
 * `purgeStatements()` in order, inside the caller's system transaction, then the `account.purged`
 * event. Only an account with an open deletion (closed, not restored, not yet purged) is touched,
 * so a retry or a second caller finds nothing to do.
 */
import { purgeStatements } from '@cp/domain';
import type pg from 'pg';

import { appendDomainEvent } from '../events';

export interface PurgedAccount {
  readonly deletionId: string;
  readonly purgedAt: Date;
}

export interface PurgeAccountOptions {
  /** True when a person asked for the purge ahead of its date (the console, a test device). */
  readonly forced?: boolean;
}

/** A statement of the purge failed; `label` names what it was erasing. */
export class AccountPurgeError extends Error {
  constructor(
    readonly label: string,
    cause: unknown,
  ) {
    super(`account purge failed at ${label}`, { cause });
    this.name = 'AccountPurgeError';
  }
}

/**
 * Runs inside a `withSystem` transaction. Returns `null` when the account has no open deletion.
 * Everything commits or nothing does: a failing statement leaves the account closed, untouched.
 */
export async function purgeAccount(
  tx: pg.PoolClient,
  uid: string,
  options: PurgeAccountOptions = {},
): Promise<PurgedAccount | null> {
  const open = await tx.query<{ id: string }>(
    `SELECT id FROM account_deletions
      WHERE user_id = $1 AND restored_at IS NULL AND purged_at IS NULL FOR UPDATE`,
    [uid],
  );
  const deletion = open.rows[0];
  if (deletion === undefined) return null;

  for (const statement of purgeStatements()) {
    try {
      await tx.query(statement.sql, [uid]);
    } catch (error) {
      throw new AccountPurgeError(statement.label, error);
    }
  }

  const done = await tx.query<{ purged_at: Date | null }>(
    'SELECT purged_at FROM account_deletions WHERE id = $1',
    [deletion.id],
  );
  const purgedAt = done.rows[0]?.purged_at;
  if (purgedAt === undefined || purgedAt === null) {
    throw new AccountPurgeError('public.account_deletions', new Error('purged_at was not set'));
  }
  await appendDomainEvent(tx, {
    type: 'account.purged',
    aggregateKind: 'account_deletion',
    aggregateId: deletion.id,
    actorKind: 'system',
    actorId: null,
    payload: { deletion_id: deletion.id, forced: options.forced === true },
  });
  return { deletionId: deletion.id, purgedAt };
}

/** Closed accounts whose purge date has come, oldest first. */
export async function dueAccountPurges(tx: pg.PoolClient, limit: number): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT user_id FROM account_deletions
      WHERE restored_at IS NULL AND purged_at IS NULL AND purge_at <= now()
      ORDER BY purge_at LIMIT $1`,
    [limit],
  );
  return rows.map((row) => row.user_id);
}
