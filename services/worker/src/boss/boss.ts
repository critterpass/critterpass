/**
 * The pg-boss runtime (docs/system-architecture.md §4.4, docs/api-contracts-async.md §2). pg-boss
 * runs in the `pgboss` schema as app_system: its pool connects with the service URL and sets the
 * session role at connect, so every table pg-boss installs or migrates is owned by app_system, as
 * docs/data-model.md §2 requires. It needs a direct connection: PgBouncer rejects that `-c role=`
 * startup option and its transaction pooling would drop the LISTEN that wakes workers.
 */
import { registerJobProducer } from '@cp/db';
import { PgBoss } from 'pg-boss';

import {
  workJob,
  type AnyJobDefinition,
  type JobFailureReport,
  type JobLogger,
  type WorkerDeps,
} from './define-job';
import { ensureQueues } from './queues';

export const BOSS_SCHEMA = 'pgboss';

export interface CreateBossOptions {
  readonly connectionString: string;
  readonly logger: JobLogger;
  /** Pool size for pg-boss's own connections (fetch, settle, maintenance). */
  readonly max?: number;
  readonly applicationName?: string;
}

export function createBoss(options: CreateBossOptions): PgBoss {
  const boss = new PgBoss({
    connectionString: options.connectionString,
    schema: BOSS_SCHEMA,
    // The schema comes from the jobs migration (owned by app_system); app_system cannot create it.
    createSchema: false,
    options: '-c role=app_system',
    application_name: options.applicationName ?? 'cp-worker-jobs',
    max: options.max ?? 2,
    useListenNotify: true,
    persistWarnings: false,
  });
  boss.on('error', (error) => options.logger.error({ err: error }, 'pg-boss error'));
  boss.on('warning', (warning) =>
    options.logger.warn({ warning: warning.message, data: warning.data }, 'pg-boss warning'),
  );
  return boss;
}

export interface StartJobRuntimeOptions {
  readonly boss: PgBoss;
  readonly deps: Omit<WorkerDeps, 'boss'>;
  readonly jobs: readonly AnyJobDefinition[];
  readonly report: JobFailureReport;
  /** Schedule catalogue crons for the registered jobs (off in tests that drive jobs by hand). */
  readonly crons?: boolean;
}

/**
 * Starts pg-boss, creates the queues the given jobs consume, registers the instance as the
 * process's `sendInTx` producer, starts one worker per job and (re)applies each job's cron.
 */
export async function startJobRuntime(options: StartJobRuntimeOptions): Promise<PgBoss> {
  const { boss, jobs } = options;
  await boss.start();
  await ensureQueues(
    boss,
    jobs.map((job) => [job.queue, job.spec] as const),
  );
  registerJobProducer(boss);
  const deps: WorkerDeps = { ...options.deps, boss };
  for (const job of jobs) {
    await workJob(boss, job, deps, options.report);
    const cron = job.spec.cron;
    if (options.crons !== false && cron !== undefined) {
      await boss.schedule(job.queue, cron.expr, null, { tz: cron.tz });
    }
  }
  return boss;
}
