/**
 * Researched opening hours: proposals are listed with their source and change nothing on the POI
 * until a person verifies them; verifying copies the hours with `hours_verified_at`.
 */
import { hoursProposalListSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let content: string;
let poiId: string;

const HOURS = {
  weekly: { mo: [{ start: '08:00', end: '18:00' }], tu: [{ start: '08:00', end: '18:00' }] },
};

async function propose(batchKey: string): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO poi_hours_proposals (poi_id, hours, source_url, fetched_at, batch_key)
     VALUES ($1, $2, 'https://www.tirtaempul.example/visit', now(), $3) RETURNING id`,
    [poiId, JSON.stringify(HOURS), batchKey],
  );
  return rows[0]!.id;
}

async function auditRows(proposalId: string) {
  const { rows } = await harness.pool.query<{ action: string }>(
    "SELECT action FROM ops.admin_audit WHERE target_kind = 'poi_hours_proposal' AND target_id = $1",
    [proposalId],
  );
  return rows.map((row) => row.action);
}

async function poiHours() {
  const { rows } = await harness.pool.query<{ hours: unknown; verified: boolean }>(
    'SELECT hours, hours_verified_at IS NOT NULL AS verified FROM pois WHERE id = $1',
    [poiId],
  );
  return rows[0];
}

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('content@critterpass.test', ['content']);
  const { rows } = await harness.pool.query<{ id: string }>(
    `WITH d AS (INSERT INTO destinations (slug, name, coverage, tz) VALUES ('bali', 'Bali', 'live', 'Asia/Makassar') RETURNING id)
     INSERT INTO pois (destination_id, name, category, lat, lng) SELECT id, 'Pura Tirta Empul', 'temple_shrine', -8.4153, 115.3154 FROM d
     RETURNING id`,
  );
  poiId = rows[0]!.id;
  app = harness.app({ areas: harness.areas() });
  content = await app.signIn('content@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

describe('opening hours proposals', () => {
  it('are listed with their source and leave the POI unchanged', async () => {
    await propose('hours-a');
    const response = await app.request('/v1/admin/content/hours', { headers: { cookie: content } });
    const list = hoursProposalListSchema.parse(await response.json());
    expect(list.items).toMatchObject([
      { poi_name: 'Pura Tirta Empul', source_url: 'https://www.tirtaempul.example/visit' },
    ]);
    expect(await poiHours()).toEqual({ hours: {}, verified: false });
  });

  it('reach the POI only once a person verifies them', async () => {
    const [proposal] = hoursProposalListSchema.parse(
      await (await app.request('/v1/admin/content/hours', { headers: { cookie: content } })).json(),
    ).items;
    const response = await app.command(content, 'verify_poi_hours', {
      proposal_id: proposal?.id,
      verdict: 'verify',
    });
    expect(response.status).toBe(200);
    expect(await poiHours()).toEqual({ hours: HOURS, verified: true });
    const again = await app.command(content, 'verify_poi_hours', {
      proposal_id: proposal?.id,
      verdict: 'reject',
    });
    expect(again.status).toBe(409);
    expect(await auditRows(proposal!.id)).toEqual(['verify_poi_hours']);
  });

  it('leave the POI as it was when rejected', async () => {
    const id = await propose('hours-b');
    await harness.pool.query(
      "UPDATE pois SET hours = '{}', hours_verified_at = NULL WHERE id = $1",
      [poiId],
    );
    await app.command(content, 'verify_poi_hours', { proposal_id: id, verdict: 'reject' });
    expect(await poiHours()).toEqual({ hours: {}, verified: false });
    expect(await auditRows(id)).toEqual(['verify_poi_hours']);
  });
});
