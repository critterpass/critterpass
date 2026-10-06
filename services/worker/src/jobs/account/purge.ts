/**
 * `account.purge` (docs/api-contracts-async.md §2.3, hourly): erases every closed account whose
 * purge date has come, each in its own transaction, through the same routine the api's purge route
 * runs (`purgeAccount`, packages/db/src/account/purge.ts). A job that names one account purges
 * only that one, and only once its date has come: a restore in the meantime wins. Every run then
 * queues `account.purge_external` for the accounts purged lately, so what they left outside
 * Postgres goes too (./purge-external.ts).
 */
import { dueAccountPurges, purgeAccount, withSystem } from '@cp/db';
import { ACCOUNT_QUEUES, accountPurgeJobSchema } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../../boss/define-job';
import { enqueueRecentExternalPurges } from './purge-external';

export const ACCOUNT_PURGE_BATCH_SIZE = 100;

export interface AccountPurgeReport {
  readonly purged: number;
  readonly failed: number;
}

/** Purges what is due (or the one account named, if it is due); never throws for one bad account. */
export async function purgeDueAccounts(
  pool: pg.Pool,
  logger: JobLogger,
  only?: string,
): Promise<AccountPurgeReport> {
  const due = await withSystem(pool, (tx) => dueAccountPurges(tx, ACCOUNT_PURGE_BATCH_SIZE));
  const uids = only === undefined ? due : due.filter((uid) => uid === only);
  const report = { purged: 0, failed: 0 };
  for (const uid of uids) {
    try {
      const purged = await withSystem(pool, (tx) => purgeAccount(tx, uid));
      if (purged !== null) report.purged += 1;
    } catch (error) {
      report.failed += 1;
      logger.error({ user_id: uid, err: error }, 'account purge failed');
    }
  }
  return report;
}

export function accountPurgeJob(): AnyJobDefinition {
  return defineJob({
    queue: ACCOUNT_QUEUES.purge,
    schema: accountPurgeJobSchema,
    async handler(data, { pool, logger }) {
      const report = await purgeDueAccounts(pool, logger, data?.user_id);
      await withSystem(pool, (tx) => enqueueRecentExternalPurges(tx));
      logger.info({ ...report }, 'account purge finished');
      // A failed account stays closed and due: the retry, or the next hour, takes it again.
      if (report.failed > 0) throw new Error(`account purge: ${report.failed} failed`);
      return { ...report };
    },
  });
}
