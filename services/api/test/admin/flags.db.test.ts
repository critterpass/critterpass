/**
 * `set_feature_flag` end to end: the typed key registry, optimistic concurrency, the client_config
 * projection, exactly one `flag.changed` realtime row, and audience-scoped keys staying server-side.
 */
import { adminFlagsResponseSchema, generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminAreas } from '../../src/admin/areas';
import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let ops: string;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.seedOperator('support@critterpass.test', ['support']);
  await harness.pool.query(
    `INSERT INTO ops.ops_config (key, value, is_public) VALUES ('guide.free_daily_limit', '30', true)`,
  );
  app = harness.app({ areas: adminAreas({ pool: harness.pool }) });
  ops = await app.signIn('ops@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app.close();
  await harness.stop();
});

async function flags() {
  const response = await app.request('/v1/admin/flags', { headers: { cookie: ops } });
  expect(response.status).toBe(200);
  return adminFlagsResponseSchema.parse(await response.json()).items;
}

async function catalogRows(): Promise<unknown[]> {
  const { rows } = await harness.pool.query<{ payload: unknown }>(
    "SELECT payload FROM rt_outbox WHERE channel = 'catalog' ORDER BY id",
  );
  return rows.map((row) => row.payload);
}

describe('set_feature_flag', () => {
  it('updates client_config, bumps the version and emits one flag.changed row', async () => {
    const before = (await flags()).find((flag) => flag.key === 'guide.free_daily_limit');
    expect(before).toMatchObject({ value: 30, client_value: 30, critical: true, version: 1 });
    const outboxBefore = (await catalogRows()).length;

    const response = await app.command(ops, 'set_feature_flag', {
      key: 'guide.free_daily_limit',
      value: 25,
      audience: { kind: 'all' },
      version: 1,
    });
    expect(response.status).toBe(200);

    const { rows } = await harness.pool.query<{ value: unknown }>(
      "SELECT value FROM client_config WHERE key = 'guide.free_daily_limit'",
    );
    expect(rows).toEqual([{ value: 25 }]);
    const outbox = await catalogRows();
    expect(outbox.slice(outboxBefore)).toEqual([
      { type: 'flag.changed', keys: ['guide.free_daily_limit'] },
    ]);
    const after = (await flags()).find((flag) => flag.key === 'guide.free_daily_limit');
    expect(after).toMatchObject({
      value: 25,
      client_value: 25,
      version: 2,
      updated_by: 'ops@critterpass.test',
    });
  });

  it('rejects a stale version with the current value', async () => {
    const response = await app.command(ops, 'set_feature_flag', {
      key: 'guide.free_daily_limit',
      value: 40,
      audience: { kind: 'all' },
      version: 1,
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; detail: unknown } };
    expect(body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      detail: { current_version: 2, current: { value: 25 } },
    });
  });

  it('keeps a cohort-scoped value out of client_config', async () => {
    const response = await app.command(ops, 'set_feature_flag', {
      key: 'perks.catalogue_version',
      value: 'beta-2',
      audience: { kind: 'cohort', cohort: 'beta' },
      version: 0,
    });
    expect(response.status).toBe(200);
    const { rowCount } = await harness.pool.query(
      "SELECT 1 FROM client_config WHERE key = 'perks.catalogue_version'",
    );
    expect(rowCount).toBe(0);
  });

  it('refuses unknown keys, mistyped values, supplier keys and non-ops roles', async () => {
    const send = (payload: Record<string, unknown>, cookie = ops) =>
      app.command(cookie, 'set_feature_flag', {
        audience: { kind: 'all' },
        version: 0,
        ...payload,
      });
    expect((await send({ key: 'made.up', value: 1 })).status).toBe(422);
    expect((await send({ key: 'seat.cap_free', value: 'six' })).status).toBe(422);
    const managed = await send({ key: 'supplier.klook_activity.enabled', value: true, version: 1 });
    expect(managed.status).toBe(409);
    const support = await app.signIn('support@critterpass.test');
    expect((await send({ key: 'seat.cap_free', value: 7 }, support)).status).toBe(403);
    expect((await app.request('/v1/admin/flags', { headers: { cookie: support } })).status).toBe(
      403,
    );
  });

  it('writes one audit row per applied change', async () => {
    const opId = generateUuidV7();
    await app.command(
      ops,
      'set_feature_flag',
      { key: 'redraft.limit_free', value: 4, audience: { kind: 'all' }, version: 0 },
      opId,
    );
    const { rows } = await harness.pool.query(
      'SELECT action, detail FROM ops.admin_audit WHERE op_id = $1',
      [opId],
    );
    expect(rows).toEqual([
      {
        action: 'set_feature_flag',
        detail: { key: 'redraft.limit_free', value: 4, audience: { kind: 'all' } },
      },
    ]);
  });
});
