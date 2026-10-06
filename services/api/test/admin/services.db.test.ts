/**
 * Services & spend and Home: AI spend by tier and route is the `ai_usage` sum, a service without a
 * fresh snapshot is `unknown` with no numbers, an owner's monthly entry books the month's spend,
 * and Home gives every role the activity summary without the audit detail.
 */
import { adminHomeSchema, servicesResponseSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let ops: string;
let owner: string;
let support: string;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('owner@critterpass.test', ['owner']);
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.seedOperator('support@critterpass.test', ['support']);
  app = harness.app({ areas: harness.areas() });
  ops = await app.signIn('ops@critterpass.test');
  owner = await app.signIn('owner@critterpass.test');
  support = await app.signIn('support@critterpass.test');
  await harness.pool.query(
    `INSERT INTO ai_usage (model, tier, route, tokens_in, tokens_out, cost_micros, at) VALUES
       ('deepseek-chat', 'fast', 'guide.chat', 10, 10, 1500000, now()),
       ('deepseek-chat', 'fast', 'guide.chat', 10, 10, 500000, now()),
       ('deepseek-reasoner', 'pro', 'quests.generate', 10, 10, 4000000, now()),
       ('deepseek-chat', 'fast', 'guide.chat', 10, 10, 9000000, now() - interval '3 days')`,
  );
  await harness.pool.query(
    `INSERT INTO ops.service_health (service, at, state, p95_ms, error_rate) VALUES
       ('apns', now() - interval '1 minute', 'degraded', 380, 0.031),
       ('fcm', now() - interval '2 hours', 'ok', 210, 0.002)`,
  );
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

async function services(cookie: string) {
  const response = await app.request('/v1/admin/services', { headers: { cookie } });
  expect(response.status).toBe(200);
  return servicesResponseSchema.parse(await response.json());
}

describe('services & spend', () => {
  it('sums AI spend today by tier and by route from ai_usage', async () => {
    const data = await services(ops);
    expect(data.ai_today_micros).toBe(6_000_000);
    expect(data.tiers.find((tier) => tier.tier === 'fast')?.today_micros).toBe(2_000_000);
    expect(data.tiers.find((tier) => tier.tier === 'pro')?.today_micros).toBe(4_000_000);
    expect(data.routes.find((route) => route.route === 'guide.chat')).toMatchObject({
      tier: 'fast',
      calls_today: 2,
      today_micros: 2_000_000,
      enabled: true,
    });
    expect(data.ai_days).toHaveLength(14);
  });

  it('shows a fresh snapshot, and unknown with no numbers for stale or missing ones', async () => {
    const data = await services(ops);
    expect(data.services.find((row) => row.key === 'apns')).toMatchObject({
      state: 'degraded',
      p95_ms: 380,
      error_rate: 0.031,
    });
    expect(data.services.find((row) => row.key === 'fcm')).toMatchObject({
      state: 'unknown',
      p95_ms: null,
      error_rate: null,
    });
    expect(data.services.find((row) => row.key === 'resend')).toMatchObject({
      state: 'unknown',
      checked_at: null,
      month_spend: null,
    });
  });

  it('books an owner-entered monthly cost; ops may not enter one', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const payload = { service: 'railway', month, amount_minor: 21_200, currency: 'USD' };
    expect((await app.command(ops, 'set_vendor_cost', payload)).status).toBe(403);
    expect((await app.command(owner, 'set_vendor_cost', payload)).status).toBe(200);
    const data = await services(ops);
    expect(data.services.find((row) => row.key === 'railway')?.month_spend).toEqual({
      amount_minor: 21_200,
      currency: 'USD',
    });
  });

  it('is not open to support', async () => {
    const response = await app.request('/v1/admin/services', { headers: { cookie: support } });
    expect(response.status).toBe(403);
  });
});

describe('home', () => {
  it('gives support the activity summary, services strip and AI spend today', async () => {
    const response = await app.request('/v1/admin/home', { headers: { cookie: support } });
    expect(response.status).toBe(200);
    const home = adminHomeSchema.parse(await response.json());
    expect(home.activity[0]).toMatchObject({
      operator: 'owner@critterpass.test',
      action: 'set_vendor_cost',
    });
    expect(Object.keys(home.activity[0] ?? {})).not.toContain('detail');
    expect(home.services.attention).toEqual([{ name: 'APNs', state: 'degraded' }]);
    expect(home.ai_today_micros).toBe(6_000_000);
  });
});
