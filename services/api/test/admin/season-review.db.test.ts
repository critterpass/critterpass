/**
 * Season review in the console: draft curves and queued events read as admin_reader with their
 * review state, approving a (possibly edited) curve through `upsert_season_editorial`, approving or
 * rejecting an event through `review_season_event`, one audit row per decision, content role only.
 */
import {
  seasonReviewCurvesSchema,
  seasonReviewEventsSchema,
  seasonReviewSummarySchema,
  type SeasonReviewCurve,
} from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let content: string;
let contentUid: string;
let lisbon: string;
let festivalId: string;
let closureId: string;

async function read<T>(path: string, parse: (body: unknown) => T): Promise<T> {
  const response = await app.request(`/v1/admin${path}`, { headers: { cookie: content } });
  expect(response.status).toBe(200);
  return parse(await response.json());
}

const summary = () => read('/season/summary', (body) => seasonReviewSummarySchema.parse(body));
const curves = (query: string) =>
  read(`/season/curves${query}`, (body) => seasonReviewCurvesSchema.parse(body).items);
const events = (query: string) =>
  read(`/season/events${query}`, (body) => seasonReviewEventsSchema.parse(body).items);

async function auditRows(action: string) {
  const { rows } = await harness.pool.query<{ admin_id: string; target_id: string }>(
    'SELECT admin_id, target_id::text FROM ops.admin_audit WHERE action = $1',
    [action],
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
  for (const month of [1, 2, 3]) {
    await harness.pool.query(
      `INSERT INTO season_months (destination_id, month, crowd_index, price_index, colour_role,
         source, source_url, sourced_on)
       VALUES ($1, $2, $3, 40, 'normal', $4, 'https://www.ine.pt', '2026-09-28')`,
      [
        lisbon,
        month,
        50 + month,
        month === 2 ? 'INE dormidas interpolated between releases' : 'INE dormidas, monthly',
      ],
    );
  }
  const queued = await harness.pool.query<{ id: string }>(
    `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, confidence,
       source, source_url, sourced_on)
     VALUES ($1, 'santo-antonio', 'festival', 'Santo António', '2027-06-12', '2027-06-13',
             'confirmed', 'web: visitlisboa.com', 'https://www.visitlisboa.com/en/events',
             '2026-09-28'),
            ($1, 'museum-closure', 'closure', 'Museum closure', '2027-01-05', '2027-01-09',
             'confirmed', 'web: example.org', 'https://example.org/closure', '2026-09-28')
     RETURNING id`,
    [lisbon],
  );
  festivalId = queued.rows[0]?.id ?? '';
  closureId = queued.rows[1]?.id ?? '';
  app = harness.app({ areas: harness.areas() });
  content = await app.signIn('content@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

describe('season review reads', () => {
  it('counts draft curves and queued events per destination', async () => {
    expect(await summary()).toEqual({
      pending_curves: 1,
      pending_events: 2,
      destinations: [{ id: lisbon, name: 'Lisbon', pending_months: 3, pending_events: 2 }],
    });
  });

  it('lists a draft curve with its interpolated months marked', async () => {
    const [curve] = await curves(`?state=pending&destination_id=${lisbon}`);
    expect(curve?.destination_name).toBe('Lisbon');
    expect(curve?.months.map((month) => [month.month, month.estimated])).toEqual([
      [1, false],
      [2, true],
      [3, false],
    ]);
    expect(await curves('?state=approved')).toEqual([]);
  });

  it('lists queued events soonest first with their source and fetched day', async () => {
    const queued = await events('?state=pending');
    expect(queued.map((event) => event.name)).toEqual(['Museum closure', 'Santo António']);
    expect(queued[1]).toMatchObject({
      source_url: 'https://www.visitlisboa.com/en/events',
      sourced_on: '2026-09-28',
      reviewed_at: null,
    });
  });

  it('is closed to roles without the content area', async () => {
    const support = await app.signIn('support@critterpass.test');
    const response = await app.request('/v1/admin/season/summary', {
      headers: { cookie: support },
    });
    expect(response.status).toBe(403);
  });
});

describe('season review decisions', () => {
  it('approves an edited curve and audits it once', async () => {
    const [curve] = await curves('?state=pending');
    const months = (curve as SeasonReviewCurve).months.map((month) => ({
      month: month.month,
      crowd_index: month.month === 2 ? 44 : month.crowd_index,
      price_index: month.price_index,
      highlight_tag: month.highlight_tag,
      colour_role: month.colour_role,
      source: month.source,
      source_url: month.source_url,
      sourced_on: month.sourced_on,
    }));
    const response = await app.command(content, 'upsert_season_editorial', {
      destination_id: lisbon,
      months,
      events: [],
      approve: true,
    });
    expect(response.status).toBe(200);
    const [approved] = await curves('?state=approved');
    expect(approved?.months.find((month) => month.month === 2)?.crowd_index).toBe(44);
    expect(approved?.months.every((month) => month.reviewed_at !== null)).toBe(true);
    expect(await auditRows('upsert_season_editorial')).toEqual([
      { admin_id: contentUid, target_id: lisbon },
    ]);
    expect((await summary()).pending_curves).toBe(0);
  });

  it('approves one event and rejects another, each audited', async () => {
    const approve = await app.command(content, 'review_season_event', {
      event_id: festivalId,
      decision: 'approve',
    });
    expect(approve.status).toBe(200);
    const reject = await app.command(content, 'review_season_event', {
      event_id: closureId,
      decision: 'reject',
    });
    expect(reject.status).toBe(200);
    expect(await events('?state=pending')).toEqual([]);
    expect((await events('?state=approved')).map((event) => event.id)).toEqual([festivalId]);
    expect(await auditRows('review_season_event.approve')).toEqual([
      { admin_id: contentUid, target_id: festivalId },
    ]);
    expect(await auditRows('review_season_event.reject')).toEqual([
      { admin_id: contentUid, target_id: closureId },
    ]);
  });

  it('refuses the commands to the support role', async () => {
    const support = await app.signIn('support@critterpass.test');
    const response = await app.command(support, 'review_season_event', {
      event_id: festivalId,
      decision: 'reject',
    });
    expect(response.status).toBe(403);
  });
});
