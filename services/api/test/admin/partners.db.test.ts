/**
 * `set_partner_adapter`: the adapter row and its public `supplier.<partner>.*` copy flags change in
 * one transaction, with optimistic concurrency and one audit row.
 */
import { partnerAdaptersResponseSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let ops: string;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.seedOperator('content@critterpass.test', ['content']);
  app = harness.app({ areas: harness.areas() });
  ops = await app.signIn('ops@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app.close();
  await harness.stop();
});

async function clientFlags(partner: string) {
  const { rows } = await harness.pool.query<{ key: string; value: unknown }>(
    'SELECT key, value FROM client_config WHERE key LIKE $1 ORDER BY key',
    [`supplier.${partner}.%`],
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

describe('set_partner_adapter', () => {
  it('enabling klook_activity flips its copy flags and stamps approval', async () => {
    const list = partnerAdaptersResponseSchema.parse(
      await (await app.request('/v1/admin/partners', { headers: { cookie: ops } })).json(),
    ).items;
    const klook = list.find((item) => item.partner === 'klook_activity');
    expect(klook).toMatchObject({ enabled: false, copy_mode: 'link', approved_at: null });

    const response = await app.command(ops, 'set_partner_adapter', {
      partner: 'klook_activity',
      enabled: true,
      copy_mode: 'booking',
      notes: 'Certified 27 Sep',
      version: klook?.version ?? 0,
    });
    expect(response.status).toBe(200);

    expect(await clientFlags('klook_activity')).toEqual({
      'supplier.klook_activity.copy_mode': 'booking',
      'supplier.klook_activity.enabled': true,
    });
    const { rows } = await harness.pool.query<{ approved_at: Date | null; notes: string }>(
      "SELECT approved_at, notes FROM ops.partner_adapters WHERE partner = 'klook_activity'",
    );
    expect(rows[0]?.approved_at).toBeInstanceOf(Date);
    const audit = await harness.pool.query(
      "SELECT target_kind, reason FROM ops.admin_audit WHERE action = 'set_partner_adapter'",
    );
    expect(audit.rows).toEqual([{ target_kind: 'partner_adapter', reason: 'Certified 27 Sep' }]);
  });

  it('rejects a stale version and leaves the flags untouched', async () => {
    const response = await app.command(ops, 'set_partner_adapter', {
      partner: 'klook_activity',
      enabled: false,
      copy_mode: 'link',
      notes: null,
      version: 1,
    });
    expect(response.status).toBe(409);
    expect((await clientFlags('klook_activity'))['supplier.klook_activity.enabled']).toBe(true);
  });

  it('refuses booking copy on a disabled adapter and a content operator', async () => {
    const booking = await app.command(ops, 'set_partner_adapter', {
      partner: 'gyg_api',
      enabled: false,
      copy_mode: 'booking',
      notes: null,
      version: 1,
    });
    expect(booking.status).toBe(409);
    const content = await app.signIn('content@critterpass.test');
    const denied = await app.command(content, 'set_partner_adapter', {
      partner: 'gyg_api',
      enabled: true,
      copy_mode: 'link',
      notes: null,
      version: 1,
    });
    expect(denied.status).toBe(403);
  });
});
