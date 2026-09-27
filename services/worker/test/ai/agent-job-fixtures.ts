/** Row readers and seeders shared by the agent job suites. */
import { randomUUID } from 'node:crypto';

import type { AgentJobStep } from '@cp/ai';
import type pg from 'pg';

export async function insertUser(pool: pg.Pool): Promise<string> {
  const id = randomUUID();
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [id]);
  return id;
}

export interface JobRowView {
  readonly status: string;
  readonly steps: AgentJobStep[];
  readonly partial: unknown;
  readonly tokens_in: number;
  readonly tokens_out: number;
  readonly cost_micros: number;
  readonly model: string | null;
}

export async function jobRow(pool: pg.Pool, id: string): Promise<JobRowView> {
  const { rows } = await pool.query<JobRowView>(
    `SELECT status, steps, partial, tokens_in::int, tokens_out::int, cost_micros::int, model
     FROM agent_jobs WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`agent job ${id} not found`);
  return row;
}

export async function usageTotals(pool: pg.Pool, jobId: string) {
  const { rows } = await pool.query<{
    rows: number;
    tokens_in: number;
    tokens_out: number;
    cost_micros: number;
  }>(
    `SELECT count(*)::int AS rows, COALESCE(sum(tokens_in), 0)::int AS tokens_in,
            COALESCE(sum(tokens_out), 0)::int AS tokens_out,
            COALESCE(sum(cost_micros), 0)::int AS cost_micros
     FROM ai_usage WHERE job_id = $1`,
    [jobId],
  );
  return rows[0];
}
