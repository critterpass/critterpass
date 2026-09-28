/**
 * `ops.ai_cost_guard` against a real migrated Postgres: spend over a tier's daily cap pauses that
 * tier in one tick and alerts once, 80 % only alerts, the monthly budget pauses every tier, and every
 * pause is audited.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  AI_COST_GUARD_STATE_KEY,
  runAiCostGuard,
  type CostAlert,
} from '../../src/jobs/ops/ai-cost-guard';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
const now = new Date('2026-09-28T09:00:00Z');

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.pool.query('DELETE FROM ai_usage');
  await harness.pool.query(
    "DELETE FROM ops.ops_config WHERE key LIKE 'ai.cap.%' OR key IN ('spend.month_budget_usd', $1)",
    [AI_COST_GUARD_STATE_KEY],
  );
});

async function spend(tier: string, usd: number, at = now): Promise<void> {
  await harness.pool.query(
    `INSERT INTO ai_usage (model, tier, route, tokens_in, tokens_out, cost_micros, at)
     VALUES ('deepseek-test', $1, 'draft.skeleton', 1000, 100, $2, $3)`,
    [tier, Math.round(usd * 1_000_000), at],
  );
}

async function cap(key: string, usd: number): Promise<void> {
  await harness.pool.query('INSERT INTO ops.ops_config (key, value) VALUES ($1, $2::jsonb)', [
    key,
    JSON.stringify(usd),
  ]);
}

async function pauses(): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM ops.admin_audit WHERE action = 'ai_cost_guard.pause'",
  );
  return rows[0]?.n ?? 0;
}

describe('AI cost guard', () => {
  it('pauses the pro tier in one tick when its daily cap is spent, and alerts once', async () => {
    await cap('ai.cap.pro.daily_usd', 10);
    await spend('pro', 6);
    await spend('pro', 4.5);
    await spend('fast', 1);
    const alerts: CostAlert[] = [];
    const auditBefore = await pauses();

    const state = await runAiCostGuard(harness.pool, { now, alert: (a) => alerts.push(a) });
    expect(state).toMatchObject({ day: '2026-09-28', ok: false, paused: ['pro'] });
    expect(state.spend_usd).toMatchObject({ pro: 10.5, fast: 1 });
    expect(alerts).toEqual([
      { cap: 'ai.cap.pro.daily_usd', level: 'pause', spend_usd: 10.5, cap_usd: 10 },
    ]);
    expect((await pauses()) - auditBefore).toBe(1);

    const again = await runAiCostGuard(harness.pool, { now, alert: (a) => alerts.push(a) });
    expect(again.paused).toEqual(['pro']);
    expect(alerts).toHaveLength(1);
    expect((await pauses()) - auditBefore).toBe(1);

    const stored = await harness.pool.query<{ value: { last_run_at: string } }>(
      'SELECT value FROM ops.ops_config WHERE key = $1',
      [AI_COST_GUARD_STATE_KEY],
    );
    expect(stored.rows[0]?.value.last_run_at).toBe(now.toISOString());
  });

  it('only alerts at 80 % and resumes on a new day', async () => {
    await cap('ai.cap.fast.daily_usd', 10);
    await spend('fast', 8.5);
    const alerts: CostAlert[] = [];
    const state = await runAiCostGuard(harness.pool, { now, alert: (a) => alerts.push(a) });
    expect(state).toMatchObject({ ok: true, paused: [] });
    expect(alerts.map((a) => a.level)).toEqual(['warn']);

    const tomorrow = new Date(now.getTime() + 86_400_000);
    const next = await runAiCostGuard(harness.pool, { now: tomorrow });
    expect(next).toMatchObject({ day: '2026-09-29', ok: true, paused: [], alerted: [] });
  });

  it('pauses every tier when the monthly budget is spent', async () => {
    await cap('spend.month_budget_usd', 100);
    await spend('fast', 60, new Date('2026-09-02T10:00:00Z'));
    await spend('pro', 45);
    const state = await runAiCostGuard(harness.pool, { now });
    expect(state).toMatchObject({ ok: false, paused: ['all'], month_usd: 105 });
  });

  it('never pauses without a cap', async () => {
    await spend('pro', 10_000);
    expect(await runAiCostGuard(harness.pool, { now })).toMatchObject({ ok: true, paused: [] });
  });
});
