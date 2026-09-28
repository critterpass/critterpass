/**
 * Kill switches over a real migrated Postgres: a missing switch is on, a switched-off route or tier
 * answers `STATE_INVALID {reason: 'switched_off', key}` (not retryable), the cost guard's pause for
 * today stops only its tier's routes, and the middleware refuses while its switch is off.
 */
import { runMigrations } from '@cp/db';
import { startPostgres } from '@cp/db/testing';
import { DomainError } from '@cp/domain';
import { Hono } from 'hono';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AI_COST_GUARD_STATE_KEY, createKillSwitches } from '../../src/ops/kill-switches';

let pool: pg.Pool;
let stop: () => Promise<unknown>;
const now = new Date('2026-09-28T09:00:00Z');

beforeAll(async () => {
  const postgres = await startPostgres();
  stop = () => postgres.stop();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 4 });
  await runMigrations(pool);
}, 240_000);

afterAll(async () => {
  await pool.end();
  await stop();
});

beforeEach(async () => {
  await pool.query("DELETE FROM ops.ops_config WHERE key LIKE '%.enabled' OR key = $1", [
    AI_COST_GUARD_STATE_KEY,
  ]);
});

async function set(key: string, value: unknown): Promise<void> {
  await pool.query('INSERT INTO ops.ops_config (key, value) VALUES ($1, $2::jsonb)', [
    key,
    JSON.stringify(value),
  ]);
}

async function refusal(run: () => Promise<unknown>): Promise<DomainError> {
  const error = await run().then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

describe('kill switches', () => {
  it('treats a missing switch as on', async () => {
    const switches = createKillSwitches(pool, { now: () => now });
    await expect(switches.assertAiRoute('guide.chat')).resolves.toBeUndefined();
    expect(await switches.isOn('signup.enabled')).toBe(true);
  });

  it('refuses a switched-off route with switched_off and its key', async () => {
    await set('ai.guide.chat.enabled', false);
    const switches = createKillSwitches(pool, { now: () => now });
    const error = await refusal(() => switches.assertAiRoute('guide.chat'));
    expect(error.code).toBe('STATE_INVALID');
    expect(error.retryable).toBe(false);
    expect(error.detail).toEqual({ reason: 'switched_off', key: 'ai.guide.chat.enabled' });
    await expect(switches.assertAiRoute('draft.skeleton')).resolves.toBeUndefined();
  });

  it('refuses every route of a switched-off tier', async () => {
    await set('ai.tier.pro.enabled', false);
    const switches = createKillSwitches(pool, { now: () => now });
    const error = await refusal(() => switches.assertAiRoute('draft.skeleton'));
    expect(error.detail).toMatchObject({ key: 'ai.tier.pro.enabled' });
    await expect(switches.assertAiRoute('guide.chat')).resolves.toBeUndefined();
  });

  it("honours the cost guard's pause for today only", async () => {
    await set(AI_COST_GUARD_STATE_KEY, { day: '2026-09-28', paused: ['pro'] });
    const today = createKillSwitches(pool, { now: () => now });
    const error = await refusal(() => today.assertAiRoute('draft.skeleton'));
    expect(error.detail).toEqual({
      reason: 'switched_off',
      key: 'ai.tier.pro.enabled',
      by: 'cost_guard',
    });
    await expect(today.assertAiRoute('guide.chat')).resolves.toBeUndefined();
    const tomorrow = createKillSwitches(pool, {
      now: () => new Date(now.getTime() + 86_400_000),
    });
    await expect(tomorrow.assertAiRoute('draft.skeleton')).resolves.toBeUndefined();
  });

  it('guards a route with the middleware and rejects keys that are not switches', async () => {
    await set('signup.enabled', false);
    const switches = createKillSwitches(pool, { now: () => now });
    const app = new Hono();
    app.onError((error, c) =>
      error instanceof DomainError
        ? c.json(error.toResponseBody(), 409)
        : c.json({ message: error.message }, 500),
    );
    app.post('/signup', switches.middleware('signup.enabled'), (c) => c.json({ ok: true }));
    const response = await app.request('/signup', { method: 'POST' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'STATE_INVALID', detail: { reason: 'switched_off', key: 'signup.enabled' } },
    });
    expect(() => switches.middleware('guide.free_daily_limit')).toThrow(/not a kill switch/);
  });
});
