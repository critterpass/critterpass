/**
 * Durable AI job bookkeeping (docs/api-contracts-async.md §2.1 "Progress", "Idempotency"), shared
 * by the api, which starts jobs inside command transactions, and the worker, which runs them:
 *
 * - `agent_jobs.steps` is the progress list clients read (synced and `GET /v1/jobs/{id}`);
 *   `agent_jobs.partial` holds the finished steps' results, so a retried job resumes after them.
 * - `input_hash` makes a repeated start of the same job a no-op, and a start with a different
 *   input cancels the still-running job it supersedes.
 *
 * Database access is injected (`RowsClient`, a `pg` transaction client in practice) so this package
 * stays free of `@cp/db`.
 */
import { createHash } from 'node:crypto';

import type { AgentJobKind } from '@cp/domain';
import { z } from 'zod';

export const AGENT_STEP_STATUSES = ['pending', 'running', 'waiting', 'done', 'failed'] as const;
export type AgentStepStatus = (typeof AGENT_STEP_STATUSES)[number];

export const agentJobStepSchema = z.object({
  step: z.string().min(1),
  status: z.enum(AGENT_STEP_STATUSES),
  attempts: z.number().int().nonnegative(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  error: z.string().nullable(),
});
export type AgentJobStep = z.infer<typeof agentJobStepSchema>;

function pendingStep(step: string): AgentJobStep {
  return { step, status: 'pending', attempts: 0, started_at: null, finished_at: null, error: null };
}

export function initialSteps(ids: readonly string[]): AgentJobStep[] {
  return ids.map(pendingStep);
}

/**
 * The stored progress list realigned to the job's current step ids: a stored step that is no
 * longer defined is dropped, a newly defined one starts pending (a renamed step reruns).
 */
export function alignSteps(stored: unknown, ids: readonly string[]): AgentJobStep[] {
  const parsed = z.array(agentJobStepSchema).safeParse(stored);
  const byId = new Map((parsed.success ? parsed.data : []).map((entry) => [entry.step, entry]));
  return ids.map((id) => byId.get(id) ?? pendingStep(id));
}

export function updateStep(
  steps: readonly AgentJobStep[],
  id: string,
  patch: Partial<Omit<AgentJobStep, 'step'>>,
): AgentJobStep[] {
  return steps.map((entry) => (entry.step === id ? { ...entry, ...patch } : entry));
}

/** Whole-percent progress: finished steps over all steps (100 once every step is done). */
export function stepsPct(steps: readonly AgentJobStep[]): number {
  if (steps.length === 0) return 100;
  const done = steps.filter((entry) => entry.status === 'done').length;
  return done >= steps.length ? 100 : Math.floor((done / steps.length) * 100);
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonicalise(entry)]),
    );
  }
  return value;
}

/** sha256 of the input's canonical JSON (keys sorted, `undefined` dropped): equal inputs, equal hash. */
export function agentInputHash(input: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalise(input)) ?? 'null')
    .digest('hex');
}

/** The slice of a `pg` client the job helpers need. */
export interface RowsClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** `(queue, data, options) => sendInTx(tx, queue, data, options)`, bound by the caller. */
export type EnqueueInTx = (
  queue: string,
  data: object,
  options: { readonly singletonKey: string },
) => Promise<string | null>;

/** What every agent job's pg-boss payload carries; the input itself is never stored in the row. */
export const agentJobPayloadSchema = z.object({
  agent_job_id: z.uuid(),
  input: z.unknown(),
});
export type AgentJobPayload = z.infer<typeof agentJobPayloadSchema>;

export interface StartAgentJobInput {
  readonly kind: AgentJobKind;
  /** The pg-boss queue whose worker runs this kind (`ai.<kind>`). */
  readonly queue: string;
  readonly userId: string | null;
  readonly tripId: string | null;
  readonly input: unknown;
  readonly stepIds: readonly string[];
  readonly baseVersionId?: string | null;
}

export interface StartedAgentJob {
  readonly id: string;
  /** False when an equal-input job was already queued, running or finished. */
  readonly created: boolean;
  /** Jobs of the same kind and owner that this start superseded. */
  readonly cancelledIds: readonly string[];
}

const LIVE_OR_DONE = ['queued', 'running', 'succeeded'];

/**
 * Starts (or finds) the agent job for `input` inside the caller's transaction: the row and its
 * pg-boss job commit together. Starts of one kind for one trip and user are serialised by an
 * advisory lock, so two racing starts can never both insert.
 */
export async function startAgentJob(
  tx: RowsClient,
  enqueue: EnqueueInTx,
  job: StartAgentJobInput,
): Promise<StartedAgentJob> {
  const hash = agentInputHash(job.input);
  const owner = [job.kind, job.tripId ?? '', job.userId ?? ''];
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `agent_job:${owner.join(':')}`,
  ]);
  const same = `kind = $1 AND trip_id IS NOT DISTINCT FROM $2 AND user_id IS NOT DISTINCT FROM $3`;
  const existing = (await tx.query(
    `SELECT id FROM agent_jobs WHERE ${same} AND input_hash = $4 AND status = ANY($5::text[])
     ORDER BY created_at DESC LIMIT 1`,
    [job.kind, job.tripId, job.userId, hash, LIVE_OR_DONE],
  )) as { rows: { id: string }[] };
  const found = existing.rows[0];
  if (found !== undefined) return { id: found.id, created: false, cancelledIds: [] };

  const cancelled = (await tx.query(
    `UPDATE agent_jobs SET status = 'cancelled'
     WHERE ${same} AND status IN ('queued', 'running') RETURNING id`,
    [job.kind, job.tripId, job.userId],
  )) as { rows: { id: string }[] };
  const inserted = (await tx.query(
    `INSERT INTO agent_jobs (trip_id, user_id, kind, status, steps, input_hash, base_version_id)
     VALUES ($1, $2, $3, 'queued', $4, $5, $6) RETURNING id`,
    [
      job.tripId,
      job.userId,
      job.kind,
      JSON.stringify(initialSteps(job.stepIds)),
      hash,
      job.baseVersionId ?? null,
    ],
  )) as { rows: { id: string }[] };
  const id = inserted.rows[0]?.id;
  if (id === undefined) throw new Error('agent_jobs insert returned no id');
  const payload: AgentJobPayload = { agent_job_id: id, input: job.input };
  const pgbossJobId = await enqueue(job.queue, payload, { singletonKey: id });
  await tx.query('UPDATE agent_jobs SET pgboss_job_id = $2 WHERE id = $1', [id, pgbossJobId]);
  return { id, created: true, cancelledIds: cancelled.rows.map((row) => row.id) };
}
