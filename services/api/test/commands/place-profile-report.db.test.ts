/**
 * Reporting a place's AI profile through `report_content` with a real pg-boss producer: the report
 * is filed and listed in the console's moderation queue with the place as its preview, the profile
 * is written again (one forced `places.profile` job), a second report within the hour joins the
 * report without another run, and a place without a ready profile cannot be reported.
 */
import { moderationQueueEntrySchema } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { startJobProducer } from '../../src/jobs/producer';
import { startAdminHarness, type AdminHarness, type AppUser, type TestApp } from '../admin/harness';

const pageSchema = z.object({ items: z.array(moderationQueueEntrySchema) });

let harness: AdminHarness;
let app: TestApp;
let boss: PgBoss;
let ops: string;
let destinationId: string;

beforeAll(async () => {
  harness = await startAdminHarness();
  boss = await startJobProducer({
    connectionString: String(
      (harness.pool.options as { connectionString: string }).connectionString,
    ),
    logger: { error: () => undefined },
  });
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  app = harness.app({ areas: harness.areas() });
  ops = await app.signIn('ops@critterpass.test');
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz)
     VALUES ('vn-hue', 'Huế', 'VN', 'guest', 'Asia/Ho_Chi_Minh') RETURNING id`,
  );
  destinationId = rows[0]?.id as string;
}, 240_000);

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await app?.close();
  await harness?.stop();
});

async function place(name: string, status: string | null): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, address)
     VALUES ($1, $2, 'museum', 16.46, 107.58, '23 Tháng 8, Huế') RETURNING id`,
    [destinationId, name],
  );
  const id = rows[0]?.id as string;
  if (status !== null) {
    await harness.pool.query(
      `INSERT INTO place_profiles (poi_id, status, generated_at) VALUES ($1, $2, now())`,
      [id, status],
    );
  }
  return id;
}

async function profileJobs(poiId: string): Promise<unknown[]> {
  const { rows } = await harness.pool.query<{ data: unknown }>(
    "SELECT data FROM pgboss.job WHERE name = 'places.profile' AND data->>'poi_id' = $1",
    [poiId],
  );
  return rows.map((row) => row.data);
}

function report(user: AppUser, id: string) {
  return app.userCommand(user, 'report_content', {
    kind: 'place_profile',
    id,
    reason: 'inaccurate',
    note: 'The ticket price is out of date',
  });
}

describe('report_content place_profile', () => {
  it('files the report, re-runs the profile once, and lists it for ops', async () => {
    const id = await place('Imperial City', 'ready');
    const first = await report(await harness.signInUser(), id);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ result: { collapsed: false } });
    expect(await profileJobs(id)).toEqual([{ poi_id: id, force: true }]);

    const response = await app.request('/v1/admin/moderation?kind=place_profile', {
      headers: { cookie: ops },
    });
    const { items } = pageSchema.parse(await response.json());
    const item = items.find((entry) => entry.target_id === id);
    expect(item).toMatchObject({
      target_kind: 'place_profile',
      reason: 'inaccurate',
      verdicts: ['approve', 'hide'],
      preview: { type: 'text', title: 'AI place profile: Imperial City' },
    });
  });

  it('shows ops the reported text, each fact with its page, and the sources', async () => {
    const id = await place('Thien Mu Pagoda', 'ready');
    await harness.pool.query(
      `UPDATE place_profiles SET texts = $2, facts = $3, sources = $4, model = 'deepseek-chat'
        WHERE poi_id = $1`,
      [
        id,
        JSON.stringify({
          en: {
            why_go: 'A seven-storey tower over the Perfume River.',
            best_time: 'Early morning.',
            crowd: 'Busy at sunset.',
            facts: ['Entry is free.'],
          },
        }),
        JSON.stringify([
          {
            kind: 'entry',
            source_url: 'https://example.org/pagoda',
            quote: 'free',
            second_source: 'none',
          },
        ]),
        JSON.stringify([{ url: 'https://example.org/pagoda', title: 'Pagoda guide' }]),
      ],
    );
    await report(await harness.signInUser(), id);
    const response = await app.request('/v1/admin/moderation?kind=place_profile', {
      headers: { cookie: ops },
    });
    const { items } = pageSchema.parse(await response.json());
    const preview = items.find((entry) => entry.target_id === id)?.preview;
    expect(preview?.type).toBe('text');
    const text = preview?.type === 'text' ? preview.text : '';
    expect(text).toContain('Why go: A seven-storey tower over the Perfume River.');
    expect(text).toContain('- entry: Entry is free. [https://example.org/pagoda]');
    expect(text).toContain('- Pagoda guide: https://example.org/pagoda');
    expect(text).toContain('by deepseek-chat');
  });

  it('refuses a second re-run within the hour, and allows one after it', async () => {
    const id = await place('Thiên Mụ Pagoda', 'ready');
    await report(await harness.signInUser(), id);
    // The first run finished, so only the hourly limit can hold the second back.
    await harness.pool.query(
      "UPDATE pgboss.job SET state = 'completed' WHERE name = 'places.profile' AND data->>'poi_id' = $1",
      [id],
    );
    const second = await report(await harness.signInUser(), id);
    expect(await second.json()).toMatchObject({ result: { collapsed: true } });
    expect(await profileJobs(id)).toHaveLength(1);

    await harness.pool.query(
      `UPDATE ops.moderation_filings SET filed_at = now() - interval '61 minutes'
        WHERE report_id IN (SELECT id FROM moderation_reports WHERE target_id = $1)`,
      [id],
    );
    await report(await harness.signInUser(), id);
    expect(await profileJobs(id)).toHaveLength(2);
  });

  it('refuses a place whose profile is not ready', async () => {
    const pending = await place('Đông Ba Market', 'pending');
    const none = await place('Trường Tiền Bridge', null);
    const reporter = await harness.signInUser();
    expect((await report(reporter, pending)).status).toBe(404);
    expect((await report(reporter, none)).status).toBe(404);
    expect(await profileJobs(pending)).toEqual([]);
  });

  it('hides the profile from the place page on a hide verdict', async () => {
    const id = await place('Khải Định Tomb', 'ready');
    await report(await harness.signInUser(), id);
    const response = await app.command(ops, 'moderate_item', {
      kind: 'place_profile',
      id,
      verdict: 'hide',
      note: 'The opening hours were wrong',
    });
    expect(response.status).toBe(200);
    const { rows } = await harness.pool.query<{ status: string }>(
      'SELECT status FROM place_profiles WHERE poi_id = $1',
      [id],
    );
    expect(rows[0]?.status).toBe('declined');
  });
});
