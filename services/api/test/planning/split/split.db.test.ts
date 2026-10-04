/**
 * Crew can't agree on the real stack: the stances with each person's own words, who has not said,
 * and two ways nobody loses built by code. When the guide declines (a recorded reply), the first
 * two candidates are worded from templates: the keen ones go early with the day's driver, and the
 * same idea somewhere everyone can go. Every option is a slot inside the place's hours on a plan
 * day; options are kept until a stance changes; an outsider is NOT_FOUND.
 */
import { createGateway, type Gateway } from '@cp/ai';
import { fixtureTransport, type FixtureTransport } from '@cp/ai/testing';
import { toLocalWallTime } from '@cp/domain';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerSplitRoute, type SplitView } from '../../../src/planning/split/route';
import { seedCurrentPlan, type SeededPlan } from '../../plan/plan-fixture';
import {
  buildSetupCrew,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';
import { seedLiveDestinations } from '../../travel-data/travel-seed';

let harness: SetupHarness;
let transport: FixtureTransport;
let a: SetupCrew;
let b: SetupCrew;
let plan: SeededPlan;
let lempuyang: string;
let gangga: string;

const OPEN = {
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start: '07:00', end: '17:00' }]]),
  ),
};

const gateway: Pick<Gateway, 'callModel'> = {
  callModel: (...args) =>
    createGateway({ apiKey: 'fixture-key', fetch: transport.fetch, maxAttempts: 1 }).callModel(
      ...args,
    ),
};

beforeAll(async () => {
  transport = fixtureTransport(Array.from({ length: 6 }, () => 'pro-chat-decline-break-in'));
  harness = await startSetupHarness(undefined, (app, deps) =>
    registerSplitRoute(app, { ...deps, gateway }),
  );
  a = await buildSetupCrew(harness, 5);
  b = await buildSetupCrew(harness, 1);
  const bali = (await seedLiveDestinations(harness.pool))['bali'] ?? '';
  const place = (name: string, lat: number) =>
    withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation, hours, editorial, tags)
         VALUES ($1, $2, 'temple_shrine', $3, 115.6, 'editorial', $4, '{"time_needed_min": 120}',
                 '{temple,water}') RETURNING id`,
        [bali, name, lat, JSON.stringify(OPEN)],
      );
      return rows[0]!.id;
    });
  lempuyang = await place('Pura Lempuyang', -8.39);
  gangga = await place('Tirta Gangga', -8.41);
  await withSystem(harness.pool, async (tx) => {
    await tx.query('UPDATE trips SET destination_id = $1, tz = $2 WHERE id = ANY($3)', [
      bali,
      'Asia/Makassar',
      [a.tripId, b.tripId],
    ]);
    for (const member of a.members.slice(1)) {
      await tx.query(
        "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
        [a.tripId, member.uid],
      );
    }
  });
  plan = await seedCurrentPlan(harness.pool, a.tripId);
  await withSystem(harness.pool, async (tx) => {
    // The driver for each day, untimed, at Rp 450,000 for the car.
    await tx.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, tz, category, cost_model,
         amount_minor, currency)
       SELECT d.version_id, d.id, d.trip_id, gen_random_uuid(), 'Asia/Makassar', 'driver',
              'group', 450000, 'IDR'
         FROM plan_days d WHERE d.version_id = $1`,
      [plan.versionId],
    );
    const [maya, jordan, alex, dee] = a.members;
    await tx.query(
      `INSERT INTO place_stances (trip_id, poi_id, user_id, stance, note) VALUES
         ($1, $2, $3, 'want', 'It''s the one photo my mum asked for.'),
         ($1, $2, $4, 'want', 'I''ll queue. I''m built for queues.'),
         ($1, $2, $5, 'rather_not', 'Five hours in a car for a queue?'),
         ($1, $2, $6, 'rather_not', NULL)`,
      [a.tripId, lempuyang, maya!.uid, jordan!.uid, alex!.uid, dee!.uid],
    );
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const split = async (who: SignedIn, poi = lempuyang, trip = a.tripId) => {
  const response = await harness.request(`/v1/trips/${trip}/places/${poi}/split`, {
    headers: { cookie: who.cookie },
  });
  return { status: response.status, body: (await response.json()) as SplitView };
};

describe('GET /v1/trips/{id}/places/{poiId}/split', () => {
  it('words the first two ways from templates when the guide declines', async () => {
    const { status, body } = await split(a.members[4]!);
    expect(status).toBe(200);
    expect(body.split).toBe(true);
    expect(body.stances.map((s) => s.note)).toContain('Five hours in a car for a queue?');
    expect(body.silent_user_ids).toEqual([a.members[4]!.uid]);
    expect(transport.requests).toHaveLength(1);
    const [keen, instead] = body.options;
    expect(keen).toMatchObject({
      kind: 'split_group',
      title: 'KEEN ONES GO EARLY',
      worded_by: 'template',
      poi_id: lempuyang,
      going_count: 2,
      cost: { minor: 450000, currency: 'IDR', per: 'car' },
    });
    expect([...keen!.attendee_ids].sort()).toEqual([a.members[0]!.uid, a.members[1]!.uid].sort());
    expect(instead).toMatchObject({
      kind: 'alternative',
      title: 'TIRTA GANGGA INSTEAD',
      poi_id: gangga,
      going_count: 5,
      cost: null,
    });
  });

  it('only offers slots inside the place hours on the plan days', async () => {
    const { body } = await split(a.organiser);
    const days = (
      await harness.pool.query<{ id: string }>('SELECT id FROM plan_days WHERE version_id = $1', [
        plan.versionId,
      ])
    ).rows.map((row) => row.id);
    for (const option of body.options) {
      expect(days).toContain(option.day_id);
      const start = toLocalWallTime(new Date(option.starts_at), 'Asia/Makassar').time;
      const end = toLocalWallTime(new Date(option.ends_at), 'Asia/Makassar').time;
      expect(start >= '07:00' && end <= '17:00').toBe(true);
    }
  });

  it('keeps the options until a stance changes', async () => {
    const before = transport.requests.length;
    await split(a.organiser);
    expect(transport.requests).toHaveLength(before);
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO place_stances (trip_id, poi_id, user_id, stance) VALUES ($1, $2, $3, 'want')`,
        [a.tripId, lempuyang, a.members[4]!.uid],
      ),
    );
    const after = await split(a.organiser);
    expect(transport.requests).toHaveLength(before + 1);
    expect(after.body.silent_user_ids).toEqual([]);
  });

  it('has no options while the crew is not split, and is NOT_FOUND for an outsider', async () => {
    const calm = await split(a.organiser, gangga);
    expect(calm.body).toMatchObject({ split: false, options: [], stances: [] });
    expect((await split(b.organiser)).status).toBe(404);
  });
});
