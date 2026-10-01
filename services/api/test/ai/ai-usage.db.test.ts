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
import {
  buildUsageRecord,
  choice,
  computeCostMicros,
  createDecisionClient,
  noul,
  recordUsage,
  score,
  type RunAsSystem,
} from '@cp/ai';
import { fixtureTransport } from '@cp/ai/testing';

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
  await pool?.end();
  await postgres?.stop();
});

describe('recordUsage', () => {
  it('writes one ai_usage row as app_system with the computed cost', async () => {
    const usage = { inputTokens: 23, cacheWriteTokens: 0, cacheReadTokens: 4410, outputTokens: 12 };
    const at = new Date('2026-09-28T05:00:00Z');
    const record = buildUsageRecord({
      model: 'deepseek-flash',
      tier: 'fast',
      usage,
      costMicros: computeCostMicros('fast', usage, at),
      context: { langfuseTraceId: 'trace-usage-db' },
      at,
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
        tier: 'fast',
        tokens_in: 4433,
        tokens_out: 12,
        cache_read: 4410,
        // 23 × 0.15 + 4410 × 0.003 + 12 × 0.6 µ$ at the off-peak fast rate.
        cost_micros: 24,
        at: new Date('2026-09-28T05:00:00Z'),
      },
    ]);
  });

  it('writes a Jev decision call as a jev row billed on input tokens', async () => {
    const jev = fixtureTransport(['jev-help-intent'], { dir: 'typesafe' });
    const decisions = createDecisionClient({
      apiKey: 'fixture-key',
      fetch: jev.fetch,
      onUsage: (record) => recordUsage(runAsSystem, record),
    });
    const decision = await decisions.decide(
      'help.intent_classifier',
      {
        state:
          'Our boat trip to Ha Long got cancelled this morning and nobody has told us how we get the money back.',
        questions: {
          topic: choice('Which help topic does this message need?', {
            refund: 'getting money back for a booking or payment',
            booking_change: 'changing dates, people or times of a booking',
            safety: 'danger, injury, police or medical help',
            other: null,
          }),
          urgent: noul('Does the writer need help within the next hour?'),
          frustration: score('How frustrated is the writer?', ['Calm', 'Annoyed', 'Angry']),
        },
      },
      { langfuseTraceId: 'trace-usage-jev' },
    );
    expect(decision.answered_by).toBe('jev');

    const { rows } = await withSystem(pool, (tx) =>
      tx.query<Record<string, unknown>>(
        `SELECT model, tier, tokens_in, tokens_out, cache_read, cost_micros::int AS cost_micros
         FROM ai_usage WHERE langfuse_trace_id = 'trace-usage-jev'`,
      ),
    );
    expect(rows).toEqual([
      {
        model: 'jev-1.13.0',
        tier: 'jev',
        tokens_in: 431,
        tokens_out: 80,
        cache_read: 0,
        cost_micros: 18,
      },
    ]);
  });

  it('never lets app_system rewrite a recorded cost', async () => {
    await expect(
      withSystem(pool, (tx) => tx.query('UPDATE ai_usage SET cost_micros = 0')),
    ).rejects.toThrow(/permission denied/i);
  });
});
