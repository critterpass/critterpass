/**
 * Kill switches over a real migrated Postgres: a missing switch is on, a switched-off route or tier
 * answers `STATE_INVALID {reason: 'switched_off', key}` (not retryable), the cost guard's pause for
 * today stops only its tier's routes, and the middleware refuses while its switch is off. Through
 * the gateway and the decision client, a switched-off call never reaches the provider (the provider
 * HTTP boundary replays recorded fixtures and counts requests), and a flip applies within one read
 * cache window.
 */
import { createDecisionClient, createGateway, noul, toGatewayError } from '@cp/ai';
import { fixtureTransport } from '@cp/ai/testing';
import { KILL_SWITCH_CACHE_MS, runMigrations } from '@cp/db';
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

describe('kill switches at the AI gateway', () => {
  const input = { messages: [{ role: 'user' as const, content: 'hi' }] };

  function gatewayWith(fixtures: readonly string[], at: () => Date = () => now) {
    const switches = createKillSwitches(pool, { now: at });
    const transport = fixtureTransport(fixtures);
    const gateway = createGateway({
      apiKey: 'fixture-key',
      fetch: transport.fetch,
      maxAttempts: 1,
      assertRouteOn: switches.assertAiRoute,
    });
    return { gateway, transport, switches };
  }

  it('never reaches the provider for a switched-off route, called or streamed', async () => {
    await set('ai.guide.chat.enabled', false);
    const { gateway, transport } = gatewayWith([]);
    const called = await refusal(() => gateway.callModel('guide.chat', input));
    expect(called.detail).toEqual({ reason: 'switched_off', key: 'ai.guide.chat.enabled' });
    const streamed = await refusal(async () => {
      for await (const event of gateway.streamModel('guide.chat', input)) void event;
    });
    expect(streamed.detail).toMatchObject({ key: 'ai.guide.chat.enabled' });
    expect(transport.urls).toHaveLength(0);
    // Callers that speak the gateway taxonomy see an unavailable, not retryable, answer.
    expect(toGatewayError(called)).toMatchObject({ code: 'AI_UNAVAILABLE', retryable: false });
  });

  it('never reaches the provider while the cost guard pauses the tier', async () => {
    await set(AI_COST_GUARD_STATE_KEY, { day: '2026-09-28', paused: ['fast'] });
    const { gateway, transport } = gatewayWith(['flash-basic']);
    const error = await refusal(() => gateway.callModel('guide.chat', input));
    expect(error.detail).toMatchObject({ key: 'ai.tier.fast.enabled', by: 'cost_guard' });
    expect(transport.urls).toHaveLength(0);
  });

  it('refuses a switched-off decision before Jev or its twin', async () => {
    await set('ai.compliance.check.enabled', false);
    const { gateway, transport, switches } = gatewayWith([]);
    const jev = fixtureTransport([], { dir: 'typesafe' });
    const decisions = createDecisionClient({
      apiKey: 'fixture-key',
      gateway,
      fetch: jev.fetch,
      assertRouteOn: switches.assertAiRoute,
    });
    const error = await refusal(() =>
      decisions.decide('compliance.check', {
        state: 'hello',
        questions: { spam: noul('Is this spam?') },
      }),
    );
    expect(error.detail).toMatchObject({ key: 'ai.compliance.check.enabled' });
    expect([...jev.urls, ...transport.urls]).toHaveLength(0);
  });

  it('applies a flip within one cache window', async () => {
    let at = now.getTime();
    const { gateway, transport } = gatewayWith(['flash-basic', 'flash-basic'], () => new Date(at));
    await gateway.callModel('guide.chat', input);
    await set('ai.guide.chat.enabled', false);
    // Inside the window the cached read still says on.
    at += KILL_SWITCH_CACHE_MS - 1;
    await gateway.callModel('guide.chat', input);
    at += 2;
    await refusal(() => gateway.callModel('guide.chat', input));
    expect(transport.urls).toHaveLength(2);
  });
});
