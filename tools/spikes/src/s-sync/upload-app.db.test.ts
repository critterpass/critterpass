import crypto from 'node:crypto';

import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ensureSpikeSchema, SPIKE_SCHEMA } from './schema';
import { applyUploadOp, type UploadOp } from './upload-app';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), connectionTimeoutMillis: 2000 });
  await ensureSpikeSchema(pool);
});

afterAll(async () => {
  await pool.end();
  await postgres.stop();
});

function makeOp(overrides: Partial<UploadOp['data']> = {}): UploadOp {
  return {
    id: crypto.randomUUID(),
    table: 'messages',
    op: 'PUT',
    data: { body: 'hello from a test', created_by: 'tester', ...overrides },
  };
}

describe('applyUploadOp (system-architecture.md §4.1 command pipeline stand-in)', () => {
  it('accepts a valid op: inserts the row and logs it', async () => {
    const op = makeOp();
    const result = await applyUploadOp(pool, op);
    expect(result).toEqual({ id: op.id, status: 'applied' });

    const row = await pool.query(`select body, created_by from ${SPIKE_SCHEMA}.messages where id = $1`, [op.id]);
    expect(row.rows).toEqual([{ body: 'hello from a test', created_by: 'tester' }]);

    const logged = await pool.query(`select 1 from ${SPIKE_SCHEMA}.cmd_log where op_id = $1`, [op.id]);
    expect(logged.rowCount).toBe(1);
  });

  it('rejects an empty body with 2xx-shaped status and a cmd_results row, never inserting a message', async () => {
    const op = makeOp({ body: '' });
    const result = await applyUploadOp(pool, op);
    expect(result).toEqual({ id: op.id, status: 'rejected', code: 'MESSAGE_EMPTY' });

    const message = await pool.query(`select 1 from ${SPIKE_SCHEMA}.messages where id = $1`, [op.id]);
    expect(message.rowCount).toBe(0);

    const cmdResult = await pool.query<{ code: string }>(
      `select code from ${SPIKE_SCHEMA}.cmd_results where op_id = $1`,
      [op.id],
    );
    expect(cmdResult.rows).toEqual([{ code: 'MESSAGE_EMPTY' }]);
  });

  it('rejects a body over the length cap with MESSAGE_TOO_LONG', async () => {
    const op = makeOp({ body: 'x'.repeat(501) });
    const result = await applyUploadOp(pool, op);
    expect(result).toEqual({ id: op.id, status: 'rejected', code: 'MESSAGE_TOO_LONG' });
  });

  it('replays the same op_id idempotently instead of inserting a duplicate or re-validating', async () => {
    const op = makeOp();
    const first = await applyUploadOp(pool, op);
    expect(first.status).toBe('applied');

    const second = await applyUploadOp(pool, op);
    expect(second).toEqual({ id: op.id, status: 'replayed' });

    const rows = await pool.query<{ count: number }>(
      `select count(*)::int as count from ${SPIKE_SCHEMA}.messages where id = $1`,
      [op.id],
    );
    expect(rows.rows[0]?.count).toBe(1);
  });
});
