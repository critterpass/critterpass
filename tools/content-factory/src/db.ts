/**
 * Database access for the factory: queueing batches for review, reading the live release of a kind
 * and billing generation to an agent job. Runs as app_system, like the worker.
 */
import { createPool, withSystem } from '@cp/db';
import type pg from 'pg';

export function openPool(env: Record<string, string | undefined> = process.env): pg.Pool | null {
  const url = env['DATABASE_URL'];
  return url === undefined || url === '' ? null : createPool(url);
}

export async function liveArtifact(pool: pg.Pool, kind: string): Promise<unknown> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ artifact: unknown }>(
      "SELECT artifact FROM content_releases WHERE kind = $1 AND status = 'published'",
      [kind],
    );
    return rows[0]?.artifact;
  });
}

/** One agent job per batch: its `ai_usage` rows roll up to the batch's route, tokens and cost. */
export async function ensureAgentJob(pool: pg.Pool, batchKey: string): Promise<string> {
  return withSystem(pool, async (tx) => {
    const existing = await tx.query<{ id: string }>(
      "SELECT id FROM agent_jobs WHERE kind = 'content' AND input_hash = $1",
      [batchKey],
    );
    if (existing.rows[0] !== undefined) return existing.rows[0].id;
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO agent_jobs (kind, status, input_hash) VALUES ('content', 'running', $1) RETURNING id",
      [batchKey],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('agent job insert returned no row');
    return id;
  });
}

/** Reviewer notes of the latest rejected batch of a kind, by item ref (`*` for the batch). */
export async function rejectionNotes(pool: pg.Pool, kind: string): Promise<Record<string, string>> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ ref: string; notes: string }>(
      `WITH latest AS (
         SELECT id, notes FROM content_releases WHERE kind = $1 AND status = 'rejected'
         ORDER BY updated_at DESC LIMIT 1
       )
       SELECT '*' AS ref, notes FROM latest WHERE notes IS NOT NULL
       UNION ALL
       SELECT r.item_ref, r.notes FROM ops.content_reviews r JOIN latest ON latest.id = r.release_id
       WHERE r.verdict = 'reject' AND r.notes IS NOT NULL`,
      [kind],
    );
    return Object.fromEntries(rows.map((row) => [row.ref, row.notes]));
  });
}
