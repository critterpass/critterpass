import { Hono } from 'hono';
import type pg from 'pg';

import { SPIKE_SCHEMA } from './schema';

const MAX_BODY_LENGTH = 500;

export interface UploadOp {
  id: string;
  table: string;
  op: string;
  data: Record<string, unknown>;
}

export type UploadStatus = 'applied' | 'rejected' | 'replayed';

export interface UploadResult {
  id: string;
  status: UploadStatus;
  code?: string;
}

/**
 * Stands in for a real command handler (system-architecture.md §4.1 pipeline, §7.c offline
 * outbox sequence): idempotent by `op_id` (here the PowerSync CRUD entry's own client-generated
 * id — client.ts), and a validation reject still commits a `cmd_results` row and answers 2xx so
 * the upload queue never gets stuck retrying a permanently-invalid op. 5xx (thrown here) is
 * reserved for genuinely transient failures, which the SDK retries with backoff.
 */
export async function applyUploadOp(pool: pg.Pool, op: UploadOp): Promise<UploadResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const existing = await client.query(`select 1 from ${SPIKE_SCHEMA}.cmd_log where op_id = $1`, [
      op.id,
    ]);
    if ((existing.rowCount ?? 0) > 0) {
      await client.query('commit');
      return { id: op.id, status: 'replayed' };
    }

    const body = typeof op.data['body'] === 'string' ? op.data['body'] : '';
    const createdBy = typeof op.data['created_by'] === 'string' ? op.data['created_by'] : 'unknown';
    const invalidReason =
      body.length === 0
        ? 'MESSAGE_EMPTY'
        : body.length > MAX_BODY_LENGTH
          ? 'MESSAGE_TOO_LONG'
          : null;

    await client.query(`insert into ${SPIKE_SCHEMA}.cmd_log (op_id) values ($1)`, [op.id]);
    if (invalidReason) {
      await client.query(
        `insert into ${SPIKE_SCHEMA}.cmd_results (op_id, code, message) values ($1, $2, $3)`,
        [op.id, invalidReason, `rejected: ${invalidReason}`],
      );
      await client.query('commit');
      return { id: op.id, status: 'rejected', code: invalidReason };
    }

    await client.query(
      `insert into ${SPIKE_SCHEMA}.messages (id, body, created_by, created_at) values ($1, $2, $3, now())`,
      [op.id, body, createdBy],
    );
    await client.query('commit');
    return { id: op.id, status: 'applied' };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Mounts `POST /sync/upload`: the one door every PowerSync client connector posts its local CRUD queue to. */
export function createUploadApp(pool: pg.Pool): Hono {
  const app = new Hono();
  app.post('/sync/upload', async (c) => {
    const body = await c.req.json<{ ops: UploadOp[] }>();
    const results: UploadResult[] = [];
    // Sequential, in order (architecture §7.c "loop each op in order") — a real handler commits
    // one op per transaction so an earlier reject never blocks a later, independent op.
    for (const op of body.ops) {
      results.push(await applyUploadOp(pool, op));
    }
    return c.json({ results });
  });
  return app;
}
