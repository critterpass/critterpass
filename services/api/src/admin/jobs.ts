/**
 * Jobs panel (ops): state counts per pg-boss queue, the dead letters waiting on each DLQ (payload
 * redacted per queue, the last error kept), each cron's last run with a one-line output summary,
 * and the live worker count from the heartbeat keys; `redrive_jobs` moves selected dead letters (or
 * all of a queue's) back onto their queue inside the command's transaction, so the move and its
 * audit row commit together.
 *
 * pg-boss is read through the api's `app_system` producer, the one documented exception to
 * "console reads run as admin_reader": the `pgboss` schema is never granted to admin_reader, and
 * payloads are redacted here before any response.
 */
import { jobTxDatabase } from '@cp/db';
import {
  DomainError,
  QUEUE_DESCRIPTIONS,
  QUEUES,
  WORKER_HEARTBEAT_KEY_PREFIX,
  WORKER_HEARTBEAT_SET,
  dlqName,
  jobPayloadRedactor,
  type QueueSpec,
} from '@cp/domain';
import type pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';

import { defineAdminArea, defineAdminCommand, defineAdminRead } from './registry';

/** The slice of the api's Redis client the worker count needs. */
export interface HeartbeatReader {
  sMembers(key: string): Promise<string[]>;
  mGet(keys: string[]): Promise<(string | null)[]>;
  sRem(key: string, members: string[]): Promise<number>;
}

export interface JobsPanelDeps {
  readonly pool: pg.Pool;
  /** The api's started pg-boss producer; undefined while it has not started. */
  readonly boss: () => Promise<PgBoss | undefined>;
  readonly redis: HeartbeatReader;
}

const DLQ_PAGE = 50;
const iso = z.iso.datetime({ offset: true });

export const jobsPanelSchema = z.object({
  queues: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      policy: z.string(),
      queued: z.number().int(),
      active: z.number().int(),
      deferred: z.number().int(),
      total: z.number().int(),
      dead_letter: z.string().nullable(),
      dead_letters: z.number().int(),
    }),
  ),
  dead_letters: z.array(
    z.object({
      queue: z.string(),
      id: z.uuid(),
      original_id: z.string().nullable(),
      failed_at: iso,
      attempts: z.number().int().nullable(),
      error: z.string().nullable(),
      data: z.unknown(),
    }),
  ),
  crons: z.array(
    z.object({
      queue: z.string(),
      expr: z.string(),
      tz: z.string(),
      last_state: z.string().nullable(),
      last_run_at: iso.nullable(),
      summary: z.string().nullable(),
    }),
  ),
  workers: z.number().int(),
});
export type JobsPanel = z.infer<typeof jobsPanelSchema>;

export const redriveJobsPayloadSchema = z
  .object({
    queue: z.string().min(1).max(80),
    job_ids: z.array(z.uuid()).min(1).max(100).optional(),
  })
  .strict();

function errorMessage(output: unknown): string | null {
  if (output === null || output === undefined) return null;
  if (typeof output === 'object' && 'message' in output) {
    const message = (output as { message?: unknown }).message;
    if (typeof message === 'string') return message.slice(0, 500);
  }
  return JSON.stringify(output).slice(0, 500);
}

/** "deleted: 3, skipped: 1" from a job's output object; values are numbers, flags or short ids. */
export function summarizeJobOutput(output: unknown): string | null {
  if (output === null || typeof output !== 'object' || Array.isArray(output)) return null;
  const parts = Object.entries(output as Record<string, unknown>)
    .slice(0, 6)
    .map(([key, value]) => {
      if (typeof value === 'number' || typeof value === 'boolean') return `${key}: ${value}`;
      if (Array.isArray(value)) return `${key}: ${value.length}`;
      if (value !== null && typeof value === 'object')
        return `${key}: {${Object.keys(value).length}}`;
      return `${key}: ${typeof value === 'string' && value.length <= 40 ? value : '…'}`;
    });
  return parts.length === 0 ? null : parts.join(', ');
}

async function workerCount(redis: HeartbeatReader): Promise<number> {
  const instances = await redis.sMembers(WORKER_HEARTBEAT_SET);
  if (instances.length === 0) return 0;
  const beats = await redis.mGet(instances.map((id) => `${WORKER_HEARTBEAT_KEY_PREFIX}${id}`));
  const gone = instances.filter((_, index) => beats[index] === null);
  if (gone.length > 0) await redis.sRem(WORKER_HEARTBEAT_SET, gone);
  return instances.length - gone.length;
}

async function lastCronRuns(pool: pg.Pool, names: readonly string[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL ROLE app_system');
    const { rows } = await client.query<{
      name: string;
      state: string;
      completed_on: Date | null;
      output: unknown;
    }>(
      `SELECT DISTINCT ON (name) name, state::text AS state, completed_on, output
       FROM pgboss.job WHERE name = ANY($1::text[]) AND state IN ('completed', 'failed')
       ORDER BY name, completed_on DESC NULLS LAST`,
      [names],
    );
    await client.query('COMMIT');
    return new Map(rows.map((row) => [row.name, row]));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function started(deps: JobsPanelDeps): Promise<PgBoss> {
  const boss = await deps.boss();
  if (boss === undefined) throw new DomainError('UPSTREAM_TIMEOUT', { reason: 'job_producer_starting' });
  return boss;
}

export async function readJobsPanel(deps: JobsPanelDeps): Promise<JobsPanel> {
  const boss = await started(deps);
  const queues = (await boss.getQueues()).sort((a, b) => a.name.localeCompare(b.name));
  const dead: JobsPanel['dead_letters'] = [];
  const deadCounts = new Map<string, number>();
  for (const queue of queues) {
    if (!queue.deadLetter || queue.name.endsWith('.dlq')) continue;
    const letters = await boss.findJobs<unknown>(queue.deadLetter, { queued: true });
    deadCounts.set(queue.name, letters.length);
    const redact = jobPayloadRedactor(queue.name);
    for (const letter of letters.slice(0, DLQ_PAGE)) {
      dead.push({
        queue: queue.name,
        id: letter.id,
        original_id: letter.sourceId,
        failed_at: letter.createdOn.toISOString(),
        attempts: letter.sourceRetryCount === null ? null : letter.sourceRetryCount + 1,
        error: errorMessage(letter.sourceOutput),
        data: redact(letter.data),
      });
    }
  }
  const crons = Object.entries(QUEUES as Record<string, QueueSpec>).flatMap(([name, spec]) =>
    spec.cron ? [{ name, cron: spec.cron }] : [],
  );
  const last = await lastCronRuns(
    deps.pool,
    crons.map((entry) => entry.name),
  );
  return {
    queues: queues
      .filter((queue) => !queue.name.endsWith('.dlq'))
      .map((queue) => ({
        name: queue.name,
        description: QUEUE_DESCRIPTIONS[queue.name] ?? null,
        policy: String(queue.policy),
        queued: queue.queuedCount,
        active: queue.activeCount,
        deferred: queue.deferredCount,
        total: queue.totalCount,
        dead_letter: queue.deadLetter ?? null,
        dead_letters: deadCounts.get(queue.name) ?? 0,
      })),
    dead_letters: dead,
    crons: crons.map(({ name, cron }) => {
      const run = last.get(name);
      return {
        queue: name,
        expr: cron.expr,
        tz: cron.tz,
        last_state: run?.state ?? null,
        last_run_at: run?.completed_on?.toISOString() ?? null,
        summary: run === undefined ? null : summarizeJobOutput(run.output),
      };
    }),
    workers: await workerCount(deps.redis),
  };
}

export function jobsArea(deps: JobsPanelDeps) {
  return defineAdminArea({
    id: 'jobs',
    reads: [
      defineAdminRead({
        path: '/jobs',
        area: 'jobs',
        summary: 'Queue states, dead letters, crons and live workers',
        response: jobsPanelSchema,
        run: () => readJobsPanel(deps),
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'redrive_jobs',
        schema: redriveJobsPayloadSchema,
        audit: (payload, result: { moved: number }) => ({
          targetKind: 'queue',
          detail: { key: payload.queue, job_ids: payload.job_ids ?? null, moved: result.moved },
          summary: `${payload.queue} · redrove ${result.moved} job${result.moved === 1 ? '' : 's'}`,
          changes: [{ field: 'dead_letters', before: result.moved, after: 0 }],
        }),
        handle: async (tx, payload) => {
          const boss = await started(deps);
          const [queue] = await boss.getQueues([payload.queue]);
          if (queue?.deadLetter !== dlqName(payload.queue)) {
            throw new DomainError('VALIDATION', { reason: 'no_dead_letter_queue' });
          }
          const moved = await boss.redrive(queue.deadLetter, {
            destination: payload.queue,
            db: jobTxDatabase(tx),
            ...(payload.job_ids === undefined ? {} : { ids: [...payload.job_ids] }),
          });
          return { queue: payload.queue, moved };
        },
      }),
    ],
  });
}
