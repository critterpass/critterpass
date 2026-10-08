/**
 * Shared set-up for suites that drive real pg-boss runtimes against a migrated Testcontainers
 * Postgres database per file: start/stop runtimes, fast-retry queue specs, and a polling `until`.
 */
import { randomUUID } from 'node:crypto';

import { resetJobProducerForTests, runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer, type StartOptions } from '@cp/db/testing';
import pg from 'pg';
import type { PgBoss } from 'pg-boss';

import {
  createBoss,
  createFailureReporter,
  DEFAULT_QUEUE_SPEC,
  startJobRuntime,
  stopJobRuntime,
  type AnyJobDefinition,
  type DeadLetterAlert,
  type QueueSpec,
} from '../../src/boss';

export const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

export interface JobsHarness {
  readonly postgres: StartedPostgreSqlContainer;
  readonly pool: pg.Pool;
  startRuntime(
    jobs: readonly AnyJobDefinition[],
    options?: { alerts?: DeadLetterAlert[]; crons?: boolean },
  ): Promise<PgBoss>;
  /** Stops one runtime now (and forgets it). */
  stopRuntime(boss: PgBoss, timeoutMs?: number): Promise<void>;
  /** Stops every runtime still running; call from afterEach. */
  stopAll(): Promise<void>;
  close(): Promise<void>;
}

export async function startJobsHarness(options: StartOptions = {}): Promise<JobsHarness> {
  const postgres = await startPostgres(options);
  const pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 8 });
  await runMigrations(pool);
  const running = new Set<PgBoss>();

  return {
    postgres,
    pool,
    async startRuntime(jobs, options = {}) {
      const alerts = options.alerts ?? [];
      const boss = createBoss({ connectionString: postgres.getConnectionUri(), logger: silent });
      running.add(boss);
      return startJobRuntime({
        boss,
        deps: { pool, logger: silent },
        jobs,
        report: createFailureReporter(silent, (alert) => alerts.push(alert)),
        crons: options.crons ?? false,
      });
    },
    async stopRuntime(boss, timeoutMs = 2000) {
      running.delete(boss);
      await stopJobRuntime(boss, timeoutMs);
    },
    async stopAll() {
      const all = [...running];
      running.clear();
      await Promise.all(all.map((boss) => stopJobRuntime(boss, 2000)));
      resetJobProducerForTests();
    },
    async close() {
      await pool.end();
      await postgres.stop();
    },
  };
}

/** A catalogue-shaped spec with immediate, fixed-delay retries for tests. */
export function fastSpec(overrides: Partial<QueueSpec> = {}): QueueSpec {
  return { ...DEFAULT_QUEUE_SPEC, retryDelay: 0, retryBackoff: false, ...overrides };
}

export function uniqueQueue(prefix: string): string {
  return `test.${prefix}_${randomUUID().slice(0, 8)}`;
}

export async function until(
  check: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`condition not met within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
