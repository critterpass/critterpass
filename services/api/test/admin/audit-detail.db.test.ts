/**
 * The standard audit detail: console commands of every area (including one whose handler writes its
 * own row) record a summary, changes, the door and the operator's roles; the emergency CLI's rows say
 * `via = cli`.
 */
import {
  ADMIN_CONSOLE_DEVICE,
  auditDetailSchema,
  generateUuidV7,
  mintAdminCliToken,
} from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SECRET, startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let owner: string;
let eventId: string;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('owner@critterpass.test', ['owner']);
  const { rows } = await harness.pool.query<{ id: string }>(
    `WITH d AS (
       INSERT INTO destinations (slug, name, coverage, currency, tz)
       VALUES ('lisbon', 'Lisbon', 'live', 'EUR', 'Europe/Lisbon') RETURNING id)
     INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, confidence,
       source, source_url, sourced_on)
     SELECT d.id, 'santo-antonio', 'festival', 'Santo António', '2027-06-12', '2027-06-13',
            'confirmed', 'web: visitlisboa.com', 'https://www.visitlisboa.com/en/events',
            '2026-09-28'
     FROM d RETURNING id`,
  );
  eventId = rows[0]?.id ?? '';
  app = harness.app({ areas: harness.areas() });
  owner = await app.signIn('owner@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app.close();
  await harness.stop();
});

async function detailOf(opId: string): Promise<unknown[]> {
  const { rows } = await harness.pool.query<{ detail: unknown }>(
    'SELECT detail FROM ops.admin_audit WHERE op_id = $1',
    [opId],
  );
  return rows.map((row) => row.detail);
}

async function run(cmd: string, payload: unknown): Promise<unknown[]> {
  const opId = generateUuidV7();
  const response = await app.command(owner, cmd, payload, opId);
  expect(response.status, cmd).toBe(200);
  return detailOf(opId);
}

describe('standard audit detail', () => {
  it('is written by commands of every area, with a before/after diff where one applies', async () => {
    const user = await harness.signInUser();
    const commands: [string, unknown][] = [
      [
        'set_feature_flag',
        { key: 'redraft.limit_free', value: 3, audience: { kind: 'all' }, version: 0 },
      ],
      [
        'set_partner_adapter',
        { partner: 'klook_activity', enabled: false, copy_mode: 'link', notes: null, version: 1 },
      ],
      ['create_concierge_task', { kind: 'review', note: 'Check the hotel' }],
      [
        'grant_entitlement',
        {
          uid: user.uid,
          perk: 'pass_plus',
          until: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          reason: 'Outage make-good',
        },
      ],
      ['review_season_event', { event_id: eventId, decision: 'approve' }],
    ];
    for (const [cmd, payload] of commands) {
      const details = await run(cmd, payload);
      expect(details, cmd).toHaveLength(1);
      const detail = auditDetailSchema.parse(details[0]);
      expect(detail).toMatchObject({ via: 'admin', roles: ['owner'] });
    }
    const { rows } = await harness.pool.query<{ detail: unknown }>(
      'SELECT detail FROM ops.admin_audit',
    );
    for (const row of rows) expect(auditDetailSchema.safeParse(row.detail).success).toBe(true);
  });

  it('records the flag change as a readable summary and diff', async () => {
    const [detail] = await run('set_feature_flag', {
      key: 'redraft.limit_free',
      value: 5,
      audience: { kind: 'all' },
      version: 1,
    });
    expect(auditDetailSchema.parse(detail)).toMatchObject({
      summary: 'redraft.limit_free · 3 → 5',
      changes: [{ field: 'value', before: 3, after: 5 }],
      key: 'redraft.limit_free',
    });
  });

  it('stamps via = cli on a command sent with an emergency CLI token', async () => {
    const token = await mintAdminCliToken({
      email: 'owner@critterpass.test',
      secret: SECRET,
      now: new Date(),
    });
    const opId = generateUuidV7();
    const response = await app.request('/v1/admin/cmd/create_concierge_task', {
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
    expect(response.status).toBe(200);
    const [detail] = await detailOf(opId);
    expect(auditDetailSchema.parse(detail)).toMatchObject({ via: 'cli', roles: ['owner'] });
  });
});
