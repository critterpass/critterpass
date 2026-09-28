/**
 * A config key's history: each `set_feature_flag` keeps the value it replaced and the operator's
 * reason, newest first.
 */
import { adminFlagsResponseSchema, flagHistoryResponseSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let ops: string;
let support: string;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.seedOperator('support@critterpass.test', ['support']);
  await harness.pool.query(
    `INSERT INTO ops.ops_config (key, value, is_public) VALUES ('guide.free_daily_limit', '30', true)`,
  );
  app = harness.app({ areas: harness.areas() });
  ops = await app.signIn('ops@critterpass.test');
  support = await app.signIn('support@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app.close();
  await harness.stop();
});

async function history(key: string, cookie = ops) {
  const response = await app.request(`/v1/admin/flags/${key}/history`, { headers: { cookie } });
  return { status: response.status, body: (await response.json()) as unknown };
}

describe('flag history', () => {
  it('shows 30 → 40 with the reason, newest first', async () => {
    const first = await app.command(ops, 'set_feature_flag', {
      key: 'guide.free_daily_limit',
      value: 40,
      audience: { kind: 'all' },
      version: 1,
      reason: 'Launch week promotion',
    });
    expect(first.status).toBe(200);
    const second = await app.command(ops, 'set_feature_flag', {
      key: 'guide.free_daily_limit',
      value: 40,
      audience: { kind: 'cohort', cohort: 'beta' },
      version: 2,
    });
    expect(second.status).toBe(200);

    const { status, body } = await history('guide.free_daily_limit');
    expect(status).toBe(200);
    const { items } = flagHistoryResponseSchema.parse(body);
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      admin: 'ops@critterpass.test',
      summary: 'guide.free_daily_limit · 30 → 40',
      changes: [{ field: 'value', before: 30, after: 40 }],
      reason: 'Launch week promotion',
      via: 'admin',
    });
    expect(items[0]).toMatchObject({
      changes: [
        { field: 'audience', before: { kind: 'all' }, after: { kind: 'cohort', cohort: 'beta' } },
      ],
      reason: null,
    });
    expect(items[0]?.summary).toMatch(/^guide\.free_daily_limit · audience /);
  });

  it('is empty for a key never changed and closed to roles without the flags area', async () => {
    expect(flagHistoryResponseSchema.parse((await history('seat.cap_free')).body).items).toEqual(
      [],
    );
    expect((await history('guide.free_daily_limit', support)).status).toBe(403);
  });

  it('keeps services keys off the flags list and tier switches to the owner', async () => {
    const list = await app.request('/v1/admin/flags', { headers: { cookie: ops } });
    const { items } = adminFlagsResponseSchema.parse(await list.json());
    expect(items.some((item) => item.key === 'ai.tier.pro.enabled')).toBe(false);
    expect(items.find((item) => item.key === 'seat.cap_free')).toMatchObject({ group: 'limits' });
    const denied = await app.command(ops, 'set_feature_flag', {
      key: 'ai.tier.pro.enabled',
      value: false,
      audience: { kind: 'all' },
      version: 0,
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({
      error: { code: 'FORBIDDEN', detail: { reason: 'key_role' } },
    });
  });
});
