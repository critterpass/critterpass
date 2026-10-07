/**
 * `account.purge_external` (docs/api-contracts-async.md §2.3): erases one purged account from the
 * stores outside Postgres. It runs only for an account whose deletion row says it was purged, so a
 * restored or still-closed account is never touched.
 *
 * Every step is safe to run again and runs whether or not an earlier one failed; if any failed the
 * attempt fails with what each step did, and the queue retries with backoff, then dead-letters.
 * A store this environment does not use (no bucket, no trace keys, no analytics) is reported as
 * `not_in_use`. Analytics that is collecting but has no admin credentials to delete with is a
 * failure: the person's events would otherwise stay.
 *
 * Once the bucket holds nothing of the account, its `media_objects` rows go too. Uploads moved to
 * `quarantine/` by a known-image match are evidence in a legal report: they are `held` unless this
 * environment is told to erase them. The feedback tracker is `not_configured` until its repository
 * and token are set; the tickets to redact stay listed in `feedback_tracker_redactions`.
 *
 * Sign-in providers are not a step here: Apple and Google tokens are revoked when the account is
 * closed (while the tokens still exist), and the sign-in rows go with the database purge.
 */
import { sendInTx, withSystem } from '@cp/db';
import {
  ACCOUNT_QUEUES,
  accountPurgeExternalJobSchema,
  type AccountPurgeExternalJob,
} from '@cp/domain';
import type pg from 'pg';

import { deleteAnalyticsPerson, type PosthogAdminOptions } from '../../analytics-export';
import {
  defineJob,
  JobAttemptError,
  type AnyJobDefinition,
  type JobLogger,
} from '../../boss/define-job';
import {
  deleteAccountMedia,
  deleteAccountTraces,
  deleteQuarantinedUploads,
  type PrefixStore,
  type TraceStoreOptions,
} from './purge-stores';
import {
  purgeLeftovers,
  redactAccountFeedback,
  type PurgeLeftovers,
  type TrackerRedactionOptions,
} from './purge-tracker';

export type StepOutcome = 'erased' | 'nothing_left' | 'not_in_use' | 'held' | 'not_configured';

export interface ExternalPurgeStep {
  readonly name: string;
  run(uid: string, deletionId: string): Promise<StepOutcome>;
}

export interface AnalyticsPurgeConfig {
  /** True when this environment sends analytics at all. */
  readonly collecting: boolean;
  readonly admin: PosthogAdminOptions | null;
  readonly pidSalt: string | undefined;
}

export interface ExternalPurgeStores {
  readonly media: PrefixStore | null;
  readonly analytics: AnalyticsPurgeConfig;
  readonly traces: TraceStoreOptions | null;
  /** True when quarantined uploads are erased with the account; otherwise they are held. */
  readonly eraseQuarantine?: boolean;
  /** The feedback tracker to redact in; `null` or absent = not configured. */
  readonly tracker?: TrackerRedactionOptions | null;
}

const counted = (count: number): StepOutcome => (count > 0 ? 'erased' : 'nothing_left');

/**
 * `leftovers` is what the database still lists for the purge (media rows, tickets to redact);
 * without it the steps only talk to the stores.
 */
export function externalPurgeSteps(
  stores: ExternalPurgeStores,
  leftovers: PurgeLeftovers | null = null,
): readonly ExternalPurgeStep[] {
  const { media, analytics, traces } = stores;
  const tracker = stores.tracker ?? null;
  return [
    {
      name: 'media',
      async run(uid) {
        if (media === null) return 'not_in_use';
        const objects = await deleteAccountMedia(media, uid);
        // The rows are the list of objects still to erase: they go only after the objects did.
        const rows = leftovers === null ? 0 : await leftovers.deleteMediaRows(uid);
        return counted(objects + rows);
      },
    },
    {
      name: 'quarantined_uploads',
      async run(uid) {
        if (media === null) return 'not_in_use';
        if (stores.eraseQuarantine !== true) return 'held';
        return counted(await deleteQuarantinedUploads(media, uid));
      },
    },
    {
      name: 'analytics',
      async run(uid) {
        if (!analytics.collecting) return 'not_in_use';
        if (analytics.admin === null || analytics.pidSalt === undefined) {
          throw new Error('analytics is collecting but has no admin credentials to delete with');
        }
        const outcome = await deleteAnalyticsPerson(analytics.admin, uid, analytics.pidSalt);
        return outcome === 'deleted' ? 'erased' : 'nothing_left';
      },
    },
    {
      name: 'ai_traces',
      run: async (uid) =>
        traces === null ? 'not_in_use' : counted(await deleteAccountTraces(traces, uid)),
    },
    {
      name: 'feedback_tracker',
      async run(_uid, deletionId) {
        if (tracker === null) return 'not_configured';
        if (leftovers === null) return 'not_in_use';
        return counted(await redactAccountFeedback(tracker, leftovers, deletionId));
      },
    },
  ];
}

export type ExternalPurgeReport = Readonly<Record<string, StepOutcome | 'failed'>>;

/** Runs every step; a failing step never stops the others. */
export async function runExternalPurge(
  steps: readonly ExternalPurgeStep[],
  uid: string,
  logger: JobLogger,
  deletionId = '',
): Promise<ExternalPurgeReport> {
  const report: Record<string, StepOutcome | 'failed'> = {};
  for (const step of steps) {
    try {
      report[step.name] = await step.run(uid, deletionId);
    } catch (error) {
      report[step.name] = 'failed';
      logger.error({ user_id: uid, step: step.name, err: error }, 'external purge step failed');
    }
  }
  return report;
}

/** True when `deletionId` is a purged deletion of `uid`. */
export async function isPurged(pool: pg.Pool, uid: string, deletionId: string): Promise<boolean> {
  const { rowCount } = await withSystem(pool, (tx) =>
    tx.query(
      'SELECT 1 FROM account_deletions WHERE id = $1 AND user_id = $2 AND purged_at IS NOT NULL',
      [deletionId, uid],
    ),
  );
  return rowCount === 1;
}

/** How far back the hourly run looks for purges to hand on; an account is handed on each time. */
export const EXTERNAL_PURGE_LOOKBACK_HOURS = 2;

/**
 * Queues the external purge for every account purged lately, whoever purged it (the hourly job,
 * the console, a test device's own purge route). One job per deletion at a time; running it again
 * an hour later finds nothing left.
 */
export async function enqueueRecentExternalPurges(tx: pg.PoolClient): Promise<number> {
  const { rows } = await tx.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM account_deletions
      WHERE purged_at > now() - make_interval(hours => $1)`,
    [EXTERNAL_PURGE_LOOKBACK_HOURS],
  );
  for (const row of rows) {
    const job: AccountPurgeExternalJob = { user_id: row.user_id, deletion_id: row.id };
    await sendInTx(tx, ACCOUNT_QUEUES.purgeExternal, job, {
      singletonKey: `purge-external:${row.id}`,
    });
  }
  return rows.length;
}

export function accountPurgeExternalJob(stores: ExternalPurgeStores): AnyJobDefinition {
  return defineJob({
    queue: ACCOUNT_QUEUES.purgeExternal,
    schema: accountPurgeExternalJobSchema,
    singletonKey: (data) => `purge-external:${data.deletion_id}`,
    async handler(data, { pool, logger }) {
      if (!(await isPurged(pool, data.user_id, data.deletion_id))) {
        logger.warn({ user_id: data.user_id }, 'external purge skipped: account is not purged');
        return { skipped: 'not_purged' };
      }
      const steps = externalPurgeSteps(stores, purgeLeftovers(pool));
      const report = await runExternalPurge(steps, data.user_id, logger, data.deletion_id);
      logger.info({ user_id: data.user_id, ...report }, 'external purge finished');
      const failed = Object.entries(report)
        .filter(([, outcome]) => outcome === 'failed')
        .map(([name]) => name);
      if (failed.length > 0) {
        throw new JobAttemptError(`external purge failed: ${failed.join(', ')}`, { ...report });
      }
      return { ...report };
    },
  });
}
