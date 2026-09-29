/**
 * The whole `ai.draft` job on recorded DeepSeek responses (the draft eval's kyoto-3 recording,
 * replayed by call at the network boundary): the crew is read through the guide's view, the
 * outline and the four days stream to `trip_draft:`, the planner validates, and one private
 * version is saved with its coverage and numbers; a rerun of the save step writes nothing new.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createGateway, startAgentJob, type DraftModel } from '@cp/ai';
import { sendInTx, withSystem } from '@cp/db';
import { DRAFT_QUEUES, DRAFT_STEP_IDS, draftCoverageSchema, draftMetricsSchema } from '@cp/domain';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { draftJob } from '../../../../src/jobs/ai/draft';
import { startJobsHarness, until, type JobsHarness } from '../../../helpers/jobs-harness';

interface Recording {
  readonly city: {
    readonly tz: string;
    readonly pois: {
      id: string;
      name: string;
      category: string;
      lat: number;
      lng: number;
      hours: unknown;
      price_level: number | null;
      duration_min: number;
      tags: string[];
      must_see: boolean;
    }[];
  };
  readonly crew: {
    readonly start: string;
    readonly days: number;
    readonly members: { name: string; tastes: string[]; chronotype: string | null }[];
    readonly diets: string[];
    readonly must_dos: { poi_id: string; owner: number }[];
  };
  readonly calls: Record<string, { status: number; body: unknown }>;
}

const RECORDING = JSON.parse(
  readFileSync(new URL('../../../fixtures/draft/kyoto-draft.json', import.meta.url), 'utf8'),
) as Recording;

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness.close();
});

const replay: DraftModel = {
  call: (route, input, key) =>
    createGateway({
      apiKey: 'fixture-key',
      maxAttempts: 1,
      fetch: () => {
        const call = RECORDING.calls[key];
        if (call === undefined) throw new Error(`no recorded call ${key}`);
        return Promise.resolve(
          new Response(JSON.stringify(call.body), {
            status: call.status,
            headers: { 'content-type': 'application/json' },
          }),
        );
      },
    }).callModel(route, input),
};

async function id(pool: pg.Pool, sql: string, values: unknown[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(sql, values);
  return rows[0]?.id as string;
}

/** The recording's crew and places, seeded as the migration owner. */
async function seedTrip(pool: pg.Pool) {
  const { crew, city } = RECORDING;
  const uids = crew.members.map(() => randomUUID());
  for (const [i, uid] of uids.entries()) {
    await pool.query("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)", [
      uid,
      `${crew.members[i]?.name ?? 'Member'} Test`,
    ]);
  }
  const organiser = uids[0] as string;
  const crewId = await id(
    pool,
    "INSERT INTO crews (name, created_by) VALUES ('Kyoto crew', $1) RETURNING id",
    [organiser],
  );
  const destinationId = await id(
    pool,
    "INSERT INTO destinations (slug, name, country, tz, currency) VALUES ('kyoto', 'Kyoto', 'Japan', $1, 'JPY') RETURNING id",
    [city.tz],
  );
  const guideId = await id(
    pool,
    "INSERT INTO guides (slug, name, colour) VALUES ('pon', 'Pon', 'green') RETURNING id",
    [],
  );
  const end = new Date(Date.parse(`${crew.start}T00:00:00Z`) + (crew.days - 1) * 86_400_000);
  const tripId = await id(
    pool,
    `INSERT INTO trips (crew_id, status, guide_id, destination_id, start_date, end_date, tz)
     VALUES ($1, 'setup', $2, $3, $4, $5, $6) RETURNING id`,
    [crewId, guideId, destinationId, crew.start, end.toISOString().slice(0, 10), city.tz],
  );
  for (const [i, uid] of uids.entries()) {
    const member = crew.members[i];
    await pool.query('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      uid,
      i === 0 ? 'organiser' : 'member',
    ]);
    await pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, uid, i === 0 ? 'organiser' : 'member'],
    );
    const chronotype =
      member?.chronotype === 'early_bird'
        ? ['early_starts']
        : member?.chronotype === 'night_owl'
          ? ['late_starts']
          : [];
    await pool.query(
      "INSERT INTO taste_profiles (user_id, tags, visibility) VALUES ($1, $2, 'crew')",
      [uid, [...(member?.tastes ?? []), ...chronotype]],
    );
  }
  await pool.query(
    'INSERT INTO participant_dietary_flags (trip_id, user_id, flags) VALUES ($1, $2, $3)',
    [tripId, uids[1], crew.diets],
  );
  for (const poi of city.pois) {
    await pool.query(
      `INSERT INTO pois (id, destination_id, name, category, lat, lng, hours, price_level, tags, editorial,
         curation, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'editorial', $11)`,
      [
        poi.id,
        destinationId,
        poi.name,
        poi.category,
        poi.lat,
        poi.lng,
        JSON.stringify(poi.hours ?? { weekly: {} }),
        poi.price_level === 0 ? null : poi.price_level,
        poi.price_level === 0 ? [...poi.tags, 'free'] : poi.tags,
        JSON.stringify({ time_needed_min: poi.duration_min, must_see: poi.must_see }),
        city.tz,
      ],
    );
  }
  await pool.query(
    `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low, nightly_minor_high,
       food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on, reviewed_at)
     VALUES ($1, 'apartment', 9000, 12000, 5500, 4000, 'USD', 'editorial', current_date, now())`,
    [destinationId],
  );
  for (const mustDo of crew.must_dos) {
    const poi = city.pois.find((p) => p.id === mustDo.poi_id);
    await pool.query(
      'INSERT INTO must_dos (trip_id, owner_id, title, poi_id) VALUES ($1, $2, $3, $4)',
      [tripId, uids[mustDo.owner], poi?.name ?? 'Must-do', mustDo.poi_id],
    );
  }
  await pool.query("UPDATE trips SET status = 'drafting' WHERE id = $1", [tripId]);
  return { tripId, organiser };
}

describe('ai.draft', () => {
  it('saves one validated private version from the recorded model replies', async () => {
    const { tripId, organiser } = await seedTrip(harness.pool);
    const job = draftJob({ model: () => replay });
    await harness.startRuntime([job]);
    const started = await withSystem(harness.pool, (tx) =>
      startAgentJob(tx, (queue, data, options) => sendInTx(tx, queue, data, options), {
        kind: 'draft',
        queue: DRAFT_QUEUES.draft,
        userId: organiser,
        tripId,
        input: { trip_id: tripId, draft_seq: 1 },
        stepIds: DRAFT_STEP_IDS,
      }),
    );
    const status = async () =>
      (
        await harness.pool.query<{ status: string }>(
          'SELECT status FROM agent_jobs WHERE id = $1',
          [started.id],
        )
      ).rows[0]?.status;
    await until(async () => ['succeeded', 'failed'].includes((await status()) ?? ''), 60_000);
    expect(await status()).toBe('succeeded');

    const { rows: trips } = await harness.pool.query<{ status: string; draft_version_id: string }>(
      'SELECT status, draft_version_id FROM trips WHERE id = $1',
      [tripId],
    );
    expect(trips[0]?.status).toBe('draft_review');
    const { rows: versions } = await harness.pool.query<{
      id: string;
      visibility: string;
      status: string;
      metrics: unknown;
      coverage: unknown;
    }>(
      'SELECT id, visibility, status, metrics, coverage FROM itinerary_versions WHERE created_by_job_id = $1',
      [started.id],
    );
    expect(versions).toHaveLength(1);
    const version = versions[0];
    expect(version).toMatchObject({
      id: trips[0]?.draft_version_id,
      visibility: 'organiser',
      status: 'draft',
    });
    const coverage = draftCoverageSchema.parse(version?.coverage);
    const metrics = draftMetricsSchema.parse(version?.metrics);
    expect(coverage.must_dos).toMatchObject({ total: 4, made: 4, missing: [] });
    expect(metrics.validation.first_pass_clean).toBe(true);
    const { rows: items } = await harness.pool.query<{ poi_id: string; created_by_kind: string }>(
      'SELECT poi_id, created_by_kind FROM plan_items WHERE version_id = $1',
      [version?.id],
    );
    const known = new Set(RECORDING.city.pois.map((p) => p.id));
    expect(items.length).toBeGreaterThan(8);
    expect(items.every((item) => known.has(item.poi_id) && item.created_by_kind === 'guide')).toBe(
      true,
    );
    expect(Object.keys(coverage.places).sort()).toEqual(
      [...new Set(items.map((i) => i.poi_id))].sort(),
    );

    const { rows: hints } = await harness.pool.query<{ type: string }>(
      "SELECT payload->>'type' AS type FROM rt_outbox WHERE channel = $1 ORDER BY id",
      [`trip_draft:${tripId}`],
    );
    const types = hints.map((h) => h.type);
    expect(types.filter((t) => t === 'draft.day_title')).toHaveLength(8);
    expect(types).toContain('draft.done');
    const ready = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'draft.ready' AND trip_id = $1",
      [tripId],
    );
    expect(ready.rowCount).toBe(1);

    // A worker that dies after the save but before the step is marked done reruns it: same version.
    await harness.pool.query(
      `UPDATE agent_jobs SET status = 'running',
         steps = (SELECT jsonb_agg(CASE WHEN s->>'step' = 'persist'
                                        THEN s || '{"status": "pending"}'::jsonb ELSE s END)
                    FROM jsonb_array_elements(steps) s)
       WHERE id = $1`,
      [started.id],
    );
    await withSystem(harness.pool, (tx) =>
      sendInTx(tx, DRAFT_QUEUES.draft, { agent_job_id: started.id, input: {} }, {}),
    );
    await until(async () => (await status()) === 'succeeded', 30_000);
    const again = await harness.pool.query('SELECT 1 FROM itinerary_versions WHERE trip_id = $1', [
      tripId,
    ]);
    expect(again.rowCount).toBe(1);
  });
});
