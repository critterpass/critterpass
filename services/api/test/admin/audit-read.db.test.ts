/**
 * The audit viewer, operator roles and the emergency CLI door: every command lands in the viewer
 * (filters, keyset pages, owner-only CSV export), `set_admin_role` applies on the operator's next
 * request, and a signed owner CLI token runs a command through the same audited pipeline.
 */
import {
  ADMIN_CONSOLE_DEVICE,
  adminMeSchema,
  auditExportSchema,
  auditFacetsSchema,
  auditPageSchema,
  generateUuidV7,
  mintAdminCliToken,
} from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SECRET, startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let owner: string;
let ops: string;
let ownerUid: string;
let contentUid: string;

beforeAll(async () => {
  harness = await startAdminHarness();
  ownerUid = await harness.seedOperator('owner@critterpass.test', ['owner']);
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  contentUid = await harness.seedOperator('content@critterpass.test', ['content']);
  app = harness.app({ areas: harness.areas() });
  owner = await app.signIn('owner@critterpass.test');
  ops = await app.signIn('ops@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app.close();
  await harness.stop();
});

async function get(path: string, cookie: string) {
  const response = await app.request(path, { headers: { cookie } });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function createTask(cookie: string, note: string | null = null) {
  const response = await app.command(cookie, 'create_concierge_task', { kind: 'review', note });
  expect(response.status).toBe(200);
}

function cliCommand(token: string, cmd: string, payload: unknown, method = 'POST') {
  return app.request(`/v1/admin/cmd/${cmd}`, {
    method,
    headers: { authorization: `CP-Admin-CLI ${token}`, 'x-real-ip': '198.51.100.9' },
    body: JSON.stringify({
      op_id: generateUuidV7(),
      cmd,
      v: 1,
      actor: { uid: generateUuidV7(), via: 'admin' },
      device: ADMIN_CONSOLE_DEVICE,
      client_ts: new Date().toISOString(),
      payload,
    }),
  });
}

describe('audit viewer', () => {
  it('lists every command newest first, filters, pages without repeats', async () => {
    await createTask(ops, 'first');
    await createTask(ops, 'second');
    await createTask(owner, 'third');

    const all = auditPageSchema.parse((await get('/v1/admin/audit', owner)).body);
    expect(all.items.map((item) => item.reason ?? item.detail)).toHaveLength(3);
    expect(all.items[0]).toMatchObject({
      admin: 'owner@critterpass.test',
      action: 'create_concierge_task',
    });

    const byOps = auditPageSchema.parse(
      (
        await get(
          `/v1/admin/audit?action=create_concierge_task&admin=${all.items[1]?.admin_id ?? ''}`,
          owner,
        )
      ).body,
    );
    expect(byOps.items.every((item) => item.admin === 'ops@critterpass.test')).toBe(true);
    expect(byOps.items).toHaveLength(2);

    const first = auditPageSchema.parse((await get('/v1/admin/audit?limit=2', ops)).body);
    expect(first.next_cursor).not.toBeNull();
    const second = auditPageSchema.parse(
      (await get(`/v1/admin/audit?limit=2&cursor=${first.next_cursor ?? ''}`, ops)).body,
    );
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(3);

    const facets = auditFacetsSchema.parse((await get('/v1/admin/audit/facets', ops)).body);
    expect(facets.actions).toEqual(['create_concierge_task']);
    expect(facets.admins.map((entry) => entry.email)).toEqual([
      'ops@critterpass.test',
      'owner@critterpass.test',
    ]);
  });

  it('exports CSV for owners only, with formulas neutralised', async () => {
    const task = await app.command(ops, 'create_concierge_task', { kind: 'review' });
    const { id } = ((await task.json()) as { result: { id: string } }).result;
    await app.command(ops, 'update_concierge_task', { id, version: 1, note: '=HYPERLINK("x")' });

    const exported = auditExportSchema.parse(
      (await get('/v1/admin/audit/export?action=update_concierge_task', owner)).body,
    );
    expect(exported.rows).toBe(1);
    const [header, row] = exported.csv.trim().split('\n');
    expect(header).toBe('at,admin,action,target_kind,target_id,reason,op_id,detail');
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect((await get('/v1/admin/audit/export', ops)).status).toBe(403);
    const content = await app.signIn('content@critterpass.test');
    expect((await get('/v1/admin/audit', content)).status).toBe(403);
  });
});

describe('set_admin_role', () => {
  it('changes an operator on their next request and never strips your own owner role', async () => {
    const content = await app.signIn('content@critterpass.test');
    const changed = await app.command(owner, 'set_admin_role', {
      uid: contentUid,
      roles: ['content', 'support'],
      reason: 'Covering support this week',
    });
    expect(changed.status).toBe(200);
    const me = adminMeSchema.parse((await get('/v1/admin/me', content)).body);
    expect(me.roles).toEqual(['content', 'support']);

    const self = await app.command(owner, 'set_admin_role', {
      uid: ownerUid,
      roles: ['ops'],
      reason: 'Oops',
    });
    expect(self.status).toBe(409);
    const byOps = await app.command(ops, 'set_admin_role', {
      uid: contentUid,
      roles: ['owner'],
      reason: 'Promote me',
    });
    expect(byOps.status).toBe(403);
    const operators = await get('/v1/admin/operators', owner);
    expect(JSON.stringify(operators.body)).toContain('content@critterpass.test');
    expect((await get('/v1/admin/operators', ops)).status).toBe(403);
  });
});

describe('emergency CLI door', () => {
  it('runs an owner command, audited like the console', async () => {
    const token = await mintAdminCliToken({
      email: 'owner@critterpass.test',
      secret: SECRET,
      now: new Date(),
    });
    const response = await cliCommand(token, 'create_concierge_task', {
      kind: 'review',
      note: 'Opened from the CLI',
    });
    expect(response.status).toBe(200);
    const { rows } = await harness.pool.query<{ admin_id: string; ip_hash: string | null }>(
      "SELECT admin_id, ip_hash FROM ops.admin_audit WHERE detail->>'kind' = 'review' ORDER BY at DESC LIMIT 1",
    );
    expect(rows[0]?.admin_id).toBe(ownerUid);
    expect(rows[0]?.ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses non-owners, bad or expired tokens, and reads', async () => {
    const opsToken = await mintAdminCliToken({
      email: 'ops@critterpass.test',
      secret: SECRET,
      now: new Date(),
    });
    expect((await cliCommand(opsToken, 'create_concierge_task', { kind: 'review' })).status).toBe(
      403,
    );
    const forged = await mintAdminCliToken({
      email: 'owner@critterpass.test',
      secret: 'another-secret-of-at-least-32-characters',
      now: new Date(),
    });
    expect((await cliCommand(forged, 'create_concierge_task', { kind: 'review' })).status).toBe(
      401,
    );
    const stale = await mintAdminCliToken({
      email: 'owner@critterpass.test',
      secret: SECRET,
      now: new Date(Date.now() - 10 * 60_000),
    });
    expect((await cliCommand(stale, 'create_concierge_task', { kind: 'review' })).status).toBe(401);
    const token = await mintAdminCliToken({
      email: 'owner@critterpass.test',
      secret: SECRET,
      now: new Date(),
    });
    const read = await app.request('/v1/admin/audit', {
      headers: { authorization: `CP-Admin-CLI ${token}` },
    });
    expect(read.status).toBe(403);
  });
});
