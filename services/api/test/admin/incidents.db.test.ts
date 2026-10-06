/**
 * Incident and maintenance banners: ops post, update and resolve them, every role reads them, and
 * a read-only maintenance window refuses console commands (except the banner's own) while the
 * owner's emergency CLI keeps working, audited `via = cli`.
 */
import {
  ADMIN_CONSOLE_DEVICE,
  bannersResponseSchema,
  generateUuidV7,
  mintAdminCliToken,
} from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SECRET, startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let ops: string;
let support: string;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('owner@critterpass.test', ['owner']);
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.seedOperator('support@critterpass.test', ['support']);
  app = harness.app({ areas: harness.areas() });
  ops = await app.signIn('ops@critterpass.test');
  support = await app.signIn('support@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

async function banners(cookie: string) {
  const response = await app.request('/v1/admin/banners', { headers: { cookie } });
  expect(response.status).toBe(200);
  return bannersResponseSchema.parse(await response.json());
}

async function post(payload: unknown): Promise<string> {
  const response = await app.command(ops, 'post_incident', payload);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { result: { id: string } };
  return body.result.id;
}

const flagChange = {
  key: 'seat.cap_free',
  value: 6,
  audience: { kind: 'all' },
  version: 0,
};

describe('incident banners', () => {
  it('shows open banners newest first to every role, and drops a resolved one', async () => {
    const first = await post({ kind: 'incident', text: 'Push delivery degraded' });
    const second = await post({
      kind: 'incident',
      text: 'Fares slow to load',
      runbook_url: 'https://runbooks.critterpass.app/fares',
    });
    const seen = await banners(support);
    expect(seen.items.map((item) => item.id)).toEqual([second, first]);
    expect(seen.items[0]).toMatchObject({
      kind: 'incident',
      runbook_url: 'https://runbooks.critterpass.app/fares',
      posted_by: 'ops@critterpass.test',
      read_only: false,
    });

    expect((await app.command(ops, 'resolve_incident', { id: first })).status).toBe(200);
    expect((await app.command(ops, 'resolve_incident', { id: second })).status).toBe(200);
    expect((await banners(support)).items).toEqual([]);
    expect((await app.command(ops, 'resolve_incident', { id: first })).status).toBe(404);
  });

  it('refuses read-only on an incident and posting for support', async () => {
    expect(
      (await app.command(ops, 'post_incident', { kind: 'incident', text: 'x', read_only: true }))
        .status,
    ).toBe(422);
    expect(
      (await app.command(support, 'post_incident', { kind: 'incident', text: 'x' })).status,
    ).toBe(403);
  });

  it('refuses console commands during read-only maintenance, but not the CLI', async () => {
    const id = await post({ kind: 'maintenance', text: 'Database upgrade', read_only: true });

    const refused = await app.command(ops, 'set_feature_flag', flagChange);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      error: { code: 'STATE_INVALID', detail: { reason: 'maintenance' } },
    });
    expect(
      (await app.command(ops, 'update_incident', { id, text: 'Database upgrade, 10 min left' }))
        .status,
    ).toBe(200);

    const token = await mintAdminCliToken({
      email: 'owner@critterpass.test',
      secret: SECRET,
      now: new Date(),
    });
    const opId = generateUuidV7();
    const cli = await app.request('/v1/admin/cmd/create_concierge_task', {
      method: 'POST',
      headers: { authorization: `CP-Admin-CLI ${token}` },
      body: JSON.stringify({
        op_id: opId,
        cmd: 'create_concierge_task',
        v: 1,
        actor: { uid: generateUuidV7(), via: 'admin' },
        device: { ...ADMIN_CONSOLE_DEVICE, id: 'ops-cli' },
        client_ts: new Date().toISOString(),
        payload: { kind: 'review' },
      }),
    });
    expect(cli.status).toBe(200);
    const { rows } = await harness.pool.query<{ via: string }>(
      "SELECT detail ->> 'via' AS via FROM ops.admin_audit WHERE op_id = $1",
      [opId],
    );
    expect(rows).toEqual([{ via: 'cli' }]);

    expect((await app.command(ops, 'resolve_incident', { id })).status).toBe(200);
    const after = await app.command(ops, 'set_feature_flag', flagChange);
    expect(after.status).not.toBe(409);
  });
});
