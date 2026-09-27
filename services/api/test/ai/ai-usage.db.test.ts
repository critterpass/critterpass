/**
 * `recordUsage` against a real, fully migrated Postgres: the row lands through `withSystem` exactly
 * as a service wires it, and the role boundary holds (app_system may not rewrite a cost).
 */
// The gateway never imports @cp/db, so this suite lives in the api, which may use both. It borrows
// the db package's migrations, role-scoped transactions and Testcontainers harness to prove
// the insert against the real table.

import { runMigrations, withSystem } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildUsageRecord, computeCostMicros, recordUsage, type RunAsSystem } from '@cp/ai';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let runAsSystem: RunAsSystem;

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 4 });
  await runMigrations(pool);
  runAsSystem = (fn) => withSystem(pool, fn);
}, 240_000);

afterAll(async () => {
  await pool.end();
  await postgres.stop();
});

describe('recordUsage', () => {
  it('writes one ai_usage row as app_system with the computed cost', async () => {
    const usage = {
      inputTokens: 23,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      cacheReadTokens: 4410,
      outputTokens: 12,
      webSearchRequests: 0,
    };
    const record = buildUsageRecord({
      model: 'claude-haiku-4-5-20251001',
      tier: 'haiku',
      usage,
      costMicros: computeCostMicros('haiku', usage),
      context: { langfuseTraceId: 'trace-usage-db' },
      at: new Date('2026-09-27T10:00:00Z'),
    });
    await recordUsage(runAsSystem, record);

    const { rows } = await withSystem(pool, (tx) =>
      tx.query<Record<string, unknown>>(
        `SELECT user_id, tier, tokens_in, tokens_out, cache_read, cost_micros::int AS cost_micros, at
         FROM ai_usage WHERE langfuse_trace_id = 'trace-usage-db'`,
      ),
    );
    expect(rows).toEqual([
      {
        user_id: null,
        tier: 'haiku',
        tokens_in: 4433,
        tokens_out: 12,
        cache_read: 4410,
        cost_micros: 524,
        at: new Date('2026-09-27T10:00:00Z'),
      },
    ]);
  });

  it('never lets app_system rewrite a recorded cost', async () => {
    await expect(
      withSystem(pool, (tx) => tx.query('UPDATE ai_usage SET cost_micros = 0')),
    ).rejects.toThrow(/permission denied/i);
  });
});
