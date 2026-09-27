/**
 * Every console command writes exactly one `ops.admin_audit` row in the command's own transaction:
 * an applied command leaves one row (with the hashed operator IP and op_id), a rejected or failing
 * one leaves none, and a replayed op_id adds none.
 */
import { DomainError, generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineAdminArea, defineAdminCommand } from '../../src/admin/registry';
import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let cookie: string;
let ownerId: string;

const configWrite = z.object({ key: z.string().min(1), fail: z.boolean().default(false) });

const probeArea = defineAdminArea({
  id: 'probe',
  reads: [],
  commands: [
    defineAdminCommand({
      name: 'write_probe_config',
      schema: configWrite,
      audit: (payload) => ({ targetKind: 'config', detail: { key: payload.key } }),
      handle: async (tx, payload, ctx) => {
        await tx.query(
          `INSERT INTO ops.ops_config (key, value, updated_by) VALUES ($1, '1'::jsonb, $2)`,
          [payload.key, ctx.admin.uid],
        );
        const setting = await tx.query<{ uid: string }>(
          "SELECT current_setting('app.admin_uid') AS uid",
        );
        if (setting.rows[0]?.uid !== ctx.admin.uid || ctx.via !== 'admin') {
          throw new Error('admin context missing');
        }
        if (payload.fail) throw new DomainError('STATE_INVALID', { state: 'probe' });
        return { key: payload.key };
      },
    }),
    defineAdminCommand({
      name: 'crash_probe_config',
      schema: z.object({ key: z.string() }),
      audit: () => ({ targetKind: 'config' }),
      handle: async (tx, payload) => {
        await tx.query(`INSERT INTO ops.ops_config (key, value) VALUES ($1, '1'::jsonb)`, [
          payload.key,
        ]);
        throw new Error('connection lost');
      },
    }),
  ],
});

beforeAll(async () => {
  harness = await startAdminHarness();
  ownerId = await harness.seedOperator('owner@critterpass.test', ['owner']);
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  app = harness.app({ areas: [probeArea] });
  cookie = await app.signIn('owner@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app.close();
  await harness.stop();
});

async function auditRows(opId: string) {
  const { rows } = await harness.pool.query<{
    admin_id: string;
    action: string;
    target_kind: string;
    ip_hash: string | null;
    detail: unknown;
  }>(
    'SELECT admin_id, action, target_kind, ip_hash, detail FROM ops.admin_audit WHERE op_id = $1',
    [opId],
  );
  return rows;
}

async function configExists(key: string): Promise<boolean> {
  const { rowCount } = await harness.pool.query('SELECT 1 FROM ops.ops_config WHERE key = $1', [
    key,
  ]);
  return rowCount === 1;
}

describe('audited console commands', () => {
  it('writes exactly one audit row with the operator, op_id and a hashed IP', async () => {
    const opId = generateUuidV7();
    const response = await app.command(cookie, 'write_probe_config', { key: 'probe.ok' }, opId);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'applied', result: { key: 'probe.ok' } });

    const rows = await auditRows(opId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      admin_id: ownerId,
      action: 'write_probe_config',
      target_kind: 'config',
      detail: { key: 'probe.ok' },
    });
    expect(rows[0]?.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.ip_hash).not.toContain('203.0.113.7');
  });

  it('adds no second row when the same op_id is replayed', async () => {
    const opId = generateUuidV7();
    await app.command(cookie, 'write_probe_config', { key: 'probe.replay' }, opId);
    const replay = await app.command(cookie, 'write_probe_config', { key: 'probe.replay' }, opId);
    expect(await replay.json()).toMatchObject({ status: 'duplicate' });
    expect(await auditRows(opId)).toHaveLength(1);
  });

  it('leaves no audit row and no write when the command rejects', async () => {
    const opId = generateUuidV7();
    const response = await app.command(
      cookie,
      'write_probe_config',
      { key: 'probe.rejected', fail: true },
      opId,
    );
    expect(response.status).toBe(409);
    expect(await auditRows(opId)).toEqual([]);
    expect(await configExists('probe.rejected')).toBe(false);
  });

  it('leaves no audit row when the command crashes mid-transaction', async () => {
    const opId = generateUuidV7();
    const response = await app.command(cookie, 'crash_probe_config', { key: 'probe.crash' }, opId);
    expect(response.status).toBe(500);
    expect(await auditRows(opId)).toEqual([]);
    expect(await configExists('probe.crash')).toBe(false);
  });

  it('leaves no audit row when the role policy refuses the command', async () => {
    const ops = await app.signIn('ops@critterpass.test');
    const opId = generateUuidV7();
    const response = await app.command(ops, 'write_probe_config', { key: 'probe.denied' }, opId);
    expect(response.status).toBe(403);
    expect(await auditRows(opId)).toEqual([]);
  });

  it('rejects an envelope that does not come from the console', async () => {
    const response = await app.request('/v1/admin/cmd/write_probe_config', {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({
        op_id: generateUuidV7(),
        cmd: 'write_probe_config',
        v: 1,
        actor: { uid: generateUuidV7(), via: 'app' },
        device: { id: 'x', platform: 'web', app_version: '1.0.0', tz: 'UTC' },
        client_ts: new Date().toISOString(),
        payload: { key: 'probe.app' },
      }),
    });
    expect(response.status).toBe(422);
  });
});
