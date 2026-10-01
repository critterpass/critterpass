/**
 * Operators and console sessions: console sign-ins are marked `console`, the owner's list merges
 * accounts with allow-listed e-mails that never signed in, the last owner can't lose the role,
 * clearing someone's roles ends their console sessions but not their app sessions, and
 * `revoke_admin_sessions` signs an operator out of the console.
 */
import { consoleOperatorsResponseSchema, generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseAdminAllowlist } from '../../src/admin/allowlist';
import { createOperatorStore, operatorsArea } from '../../src/admin/operators';
import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

const ALLOWLIST =
  'owner@critterpass.test:owner,ops@critterpass.test:ops,content@critterpass.test:content,new@critterpass.test:support';

let harness: AdminHarness;
let app: TestApp;
let owner: string;
let ownerUid: string;
let opsUid: string;
let contentUid: string;

beforeAll(async () => {
  harness = await startAdminHarness();
  ownerUid = await harness.seedOperator('owner@critterpass.test', ['owner']);
  opsUid = await harness.seedOperator('ops@critterpass.test', ['ops']);
  contentUid = await harness.seedOperator('content@critterpass.test', ['content']);
  app = harness.app({
    areas: [
      ...harness.areas().filter((area) => area.id !== 'operators'),
      operatorsArea({
        operators: createOperatorStore(harness.pool),
        allowlist: parseAdminAllowlist(ALLOWLIST),
      }),
    ],
  });
  owner = await app.signIn('owner@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

async function operators() {
  const response = await app.request('/v1/admin/operators', { headers: { cookie: owner } });
  expect(response.status).toBe(200);
  return consoleOperatorsResponseSchema.parse(await response.json());
}

async function sessions(uid: string) {
  const { rows } = await harness.pool.query<{ console: boolean }>(
    'SELECT console FROM auth.session WHERE user_id = $1 ORDER BY created_at',
    [uid],
  );
  return rows.map((row) => row.console);
}

async function me(cookie: string): Promise<number> {
  return (await app.request('/v1/admin/me', { headers: { cookie } })).status;
}

async function errorOf(response: Response) {
  return ((await response.json()) as { error: { code: string; detail?: unknown } }).error;
}

describe('operators', () => {
  it('lists console accounts with their console activity and invited e-mails', async () => {
    await app.signIn('ops@critterpass.test');
    expect(await sessions(opsUid)).toEqual([true]);
    const list = await operators();
    expect(list.items.find((item) => item.uid === opsUid)).toMatchObject({
      email: 'ops@critterpass.test',
      roles: ['ops'],
      console_sessions: 1,
    });
    expect(list.items.find((item) => item.uid === opsUid)?.last_console_sign_in_at).not.toBeNull();
    expect(list.items.find((item) => item.uid === contentUid)).toMatchObject({
      last_console_sign_in_at: null,
      console_sessions: 0,
    });
    expect(list.invited).toEqual([
      { email: 'new@critterpass.test', roles: ['support'], last_console_sign_in_at: null },
    ]);
    const ops = await app.signIn('ops@critterpass.test');
    expect((await app.request('/v1/admin/operators', { headers: { cookie: ops } })).status).toBe(
      403,
    );
  });

  it('refuses to remove the only owner', async () => {
    const response = await app.command(owner, 'set_admin_role', {
      uid: ownerUid,
      roles: ['ops'],
      reason: 'Stepping back',
    });
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'last_owner' },
    });
  });

  it('ends console sessions but not app sessions when roles are cleared', async () => {
    const ops = await app.signIn('ops@critterpass.test');
    expect(await me(ops)).toBe(200);
    await harness.pool.query(
      `INSERT INTO auth.session (id, user_id, token, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 day')`,
      [generateUuidV7(), opsUid, `app-${generateUuidV7()}`],
    );
    const response = await app.command(owner, 'set_admin_role', {
      uid: opsUid,
      roles: [],
      reason: 'Left the team',
    });
    expect(response.status).toBe(200);
    expect(await sessions(opsUid)).toEqual([false]);
    expect(await me(ops)).toBe(401);
    const { rows } = await harness.pool.query<{ detail: { summary: string } }>(
      "SELECT detail FROM ops.admin_audit WHERE action = 'set_admin_role' AND target_id = $1",
      [opsUid],
    );
    expect(rows[0]?.detail.summary).toBe('ops@critterpass.test · ops → no roles');
  });

  it('revokes the console sessions of an operator', async () => {
    const content = await app.signIn('content@critterpass.test');
    expect(await me(content)).toBe(200);
    const response = await app.command(owner, 'revoke_admin_sessions', {
      uid: contentUid,
      reason: 'Lost laptop',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { ended: 1 } });
    expect(await me(content)).toBe(401);
    expect(await me(owner)).toBe(200);
  });
});
