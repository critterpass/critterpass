/**
 * `agent_jobs` reads and writes shared by the agent job runner and its batch steps. Every write
 * is conditional on the job still being live (`queued`/`running`), so a job cancelled by a newer
 * start (packages/ai/src/job-steps.ts#startAgentJob) stops at its next write instead of
 * overwriting the cancellation.
 */
import { outbox, withSystem } from '@cp/db';
import { JOB_PROGRESS_TYPE, jobProgressData, type AgentJobKind } from '@cp/domain';
import type { AgentJobStep } from '@cp/ai';
import type pg from 'pg';

export interface AgentJobRow {
  readonly id: string;
  readonly kind: AgentJobKind;
  readonly status: string;
  readonly userId: string | null;
  readonly tripId: string | null;
  readonly steps: unknown;
  readonly partial: unknown;
}

export const TERMINAL_JOB_STATUSES: ReadonlySet<string> = new Set([
  'succeeded',
  'failed',
  'cancelled',
]);

const SELECT_JOB = `SELECT id, kind, status, user_id AS "userId", trip_id AS "tripId", steps, partial
  FROM agent_jobs WHERE id = $1`;

export async function loadAgentJob(
  client: pg.PoolClient,
  id: string,
  options: { readonly lock?: boolean } = {},
): Promise<AgentJobRow | undefined> {
  const { rows } = await client.query<AgentJobRow>(
    options.lock === true ? `${SELECT_JOB} FOR UPDATE` : SELECT_JOB,
    [id],
  );
  return rows[0];
}

export function readAgentJob(pool: pg.Pool, id: string): Promise<AgentJobRow | undefined> {
  return withSystem(pool, (tx) => loadAgentJob(tx, id));
}

export interface AgentJobPatch {
  readonly status?: 'running' | 'succeeded' | 'failed';
  readonly steps?: readonly AgentJobStep[];
  readonly partial?: Readonly<Record<string, unknown>>;
  readonly resultRef?: unknown;
  readonly pgbossJobId?: string;
}

/** Applies `patch` while the job is live; false when it was cancelled (or already finished). */
export async function saveAgentJob(
  tx: pg.PoolClient,
  id: string,
  patch: AgentJobPatch,
): Promise<boolean> {
  const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value));
  const { rowCount } = await tx.query(
    `UPDATE agent_jobs SET
       status = COALESCE($2, status),
       steps = COALESCE($3::jsonb, steps),
       partial = COALESCE($4::jsonb, partial),
       result_ref = COALESCE($5::jsonb, result_ref),
       pgboss_job_id = COALESCE($6, pgboss_job_id)
     WHERE id = $1 AND status IN ('queued', 'running')`,
    [
      id,
      patch.status ?? null,
      json(patch.steps),
      json(patch.partial),
      json(patch.resultRef),
      patch.pgbossJobId ?? null,
    ],
  );
  return rowCount === 1;
}

/**
 * Sets the job's token and cost totals to the sum of its `ai_usage` rows, so the totals can never
 * drift from the per-call records however often a step is retried.
 */
export async function rollUpJobCost(tx: pg.PoolClient, id: string): Promise<void> {
  await tx.query(
    `UPDATE agent_jobs AS j
        SET tokens_in = u.tokens_in, tokens_out = u.tokens_out, cost_micros = u.cost_micros,
            model = COALESCE(u.model, j.model)
       FROM (SELECT COALESCE(sum(tokens_in), 0) AS tokens_in,
                    COALESCE(sum(tokens_out), 0) AS tokens_out,
                    COALESCE(sum(cost_micros), 0) AS cost_micros,
                    (array_agg(model ORDER BY at DESC))[1] AS model
               FROM ai_usage WHERE job_id = $1) AS u
      WHERE j.id = $1`,
    [id],
  );
}

/** One `job.progress` hint after a finished step (`job_id` is the `agent_jobs` id clients poll). */
export async function publishProgress(
  tx: pg.PoolClient,
  channel: string | undefined,
  id: string,
  step: string,
  steps: readonly AgentJobStep[],
): Promise<void> {
  if (channel === undefined) return;
  const done = steps.filter((entry) => entry.status === 'done').length;
  const data = jobProgressData({ jobId: id, step, done, total: steps.length });
  await outbox(tx, channel, JOB_PROGRESS_TYPE, data);
}
