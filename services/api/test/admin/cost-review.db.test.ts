/**
 * Cost index review in the console: draft price bands read as admin_reader with their review
 * state, approving one as it is and another with edited amounts through `review_cost_index`, one
 * audit row per decision, content role only.
 */
import { costReviewIndicesSchema, costReviewSummarySchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let content: string;
let contentUid: string;
let lisbon: string;
let hotelId: string;
let hostelId: string;

async function read<T>(path: string, parse: (body: unknown) => T): Promise<T> {
  const response = await app.request(`/v1/admin${path}`, { headers: { cookie: content } });
  expect(response.status).toBe(200);
  return parse(await response.json());
}

const summary = () => read('/costs/summary', (body) => costReviewSummarySchema.parse(body));
const indices = (query: string) =>
  read(`/costs/indices${query}`, (body) => costReviewIndicesSchema.parse(body).items);

async function stored(id: string) {
  const { rows } = await harness.pool.query<{
    nightly_minor_low: string;
    nightly_minor_high: string;
    food_pp_day_minor: string;
    reviewed: boolean;
  }>(
    `SELECT nightly_minor_low, nightly_minor_high, food_pp_day_minor,
            reviewed_at IS NOT NULL AS reviewed
       FROM destination_cost_indices WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function auditRows() {
  const { rows } = await harness.pool.query<{
    admin_id: string;
    target_kind: string;
    target_id: string;
    detail: Record<string, unknown>;
  }>(
    `SELECT admin_id, target_kind, target_id::text, detail FROM ops.admin_audit
      WHERE action = 'review_cost_index' ORDER BY at, id`,
  );
  return rows;
}

beforeAll(async () => {
  harness = await startAdminHarness();
  contentUid = await harness.seedOperator('content@critterpass.test', ['content']);
  await harness.seedOperator('support@critterpass.test', ['support']);
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, currency, tz)
     VALUES ('lisbon', 'Lisbon', 'live', 'EUR', 'Europe/Lisbon') RETURNING id`,
  );
  lisbon = rows[0]?.id ?? '';
  const inserted = await harness.pool.query<{ id: string }>(
    `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low,
       nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, source, source_url,
       sourced_on)
     VALUES ($1, 'hotel', 6000, 12000, 4000, 3000, 'USD', 'Editorial estimate', NULL,
             '2026-09-28'),
            ($1, 'hostel', 2000, 3500, 2500, 1500, 'USD', 'Hostel listings, September',
             'https://www.hostelworld.com/', '2026-09-28')
     RETURNING id`,
    [lisbon],
  );
  hotelId = inserted.rows[0]?.id ?? '';
  hostelId = inserted.rows[1]?.id ?? '';
  app = harness.app({ areas: harness.areas() });
  content = await app.signIn('content@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app.close();
  await harness.stop();
});

describe('cost index review reads', () => {
  it('counts draft indices per destination', async () => {
    expect(await summary()).toEqual({
      pending: 2,
      destinations: [{ id: lisbon, name: 'Lisbon', pending: 2 }],
    });
  });

  it('lists draft bands with unsourced rows marked as estimates', async () => {
    const drafts = await indices(`?state=pending&destination_id=${lisbon}`);
    expect(drafts.map((row) => [row.stay_type, row.estimated])).toEqual([
      ['hotel', true],
      ['hostel', false],
    ]);
    expect(drafts[0]).toMatchObject({
      destination_name: 'Lisbon',
      nightly_minor_low: 6000,
      nightly_minor_high: 12000,
      food_pp_day_minor: 4000,
      fun_pp_day_minor: 3000,
      currency: 'USD',
      reviewed_at: null,
    });
    expect(await indices('?state=approved')).toEqual([]);
  });

  it('is closed to roles without the content area', async () => {
    const support = await app.signIn('support@critterpass.test');
    const response = await app.request('/v1/admin/costs/summary', {
      headers: { cookie: support },
    });
    expect(response.status).toBe(403);
  });
});

describe('cost index review decisions', () => {
  it('approves an index as it is and audits it once', async () => {
    const response = await app.command(content, 'review_cost_index', { index_id: hostelId });
    expect(response.status).toBe(200);
    expect(await stored(hostelId)).toEqual({
      nightly_minor_low: '2000',
      nightly_minor_high: '3500',
      food_pp_day_minor: '2500',
      reviewed: true,
    });
    const [row] = await auditRows();
    expect(row).toMatchObject({
      admin_id: contentUid,
      target_kind: 'destination_cost_index',
      target_id: hostelId,
      detail: { destination_id: lisbon, edited: false },
    });
  });

  it('saves edited amounts and approves them in one audited step', async () => {
    const amounts = {
      nightly_minor_low: 7000,
      nightly_minor_high: 14000,
      food_pp_day_minor: 4500,
      fun_pp_day_minor: 3000,
    };
    const response = await app.command(content, 'review_cost_index', {
      index_id: hotelId,
      amounts,
    });
    expect(response.status).toBe(200);
    expect(await stored(hotelId)).toEqual({
      nightly_minor_low: '7000',
      nightly_minor_high: '14000',
      food_pp_day_minor: '4500',
      reviewed: true,
    });
    const rows = await auditRows();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      admin_id: contentUid,
      target_id: hotelId,
      detail: {
        edited: true,
        before: { nightly_minor_low: 6000, nightly_minor_high: 12000 },
        after: amounts,
      },
    });
    expect(await summary()).toMatchObject({ pending: 0 });
    expect((await indices('?state=approved')).map((row) => row.stay_type)).toEqual([
      'hotel',
      'hostel',
    ]);
  });

  it('rejects an inverted range and leaves no audit row', async () => {
    const response = await app.command(content, 'review_cost_index', {
      index_id: hotelId,
      amounts: {
        nightly_minor_low: 9000,
        nightly_minor_high: 5000,
        food_pp_day_minor: 4500,
        fun_pp_day_minor: 3000,
      },
    });
    expect(response.status).toBe(422);
    expect(await auditRows()).toHaveLength(2);
  });

  it('refuses the command to the support role', async () => {
    const support = await app.signIn('support@critterpass.test');
    const response = await app.command(support, 'review_cost_index', { index_id: hotelId });
    expect(response.status).toBe(403);
  });
});
