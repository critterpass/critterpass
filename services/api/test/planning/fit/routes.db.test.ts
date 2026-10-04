/**
 * Fit over HTTP on the real stack: a participant gets each place's grade per day, an outsider gets
 * NOT_FOUND, an organiser's draft day is theirs alone, fifty places answer in one request, an
 * unapproved editorial crowd curve never shapes a fit, and nearby places and gap ideas read the
 * same plan.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { gapIdeasResultSchema, placeFitSchema } from '@cp/domain';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerFitRoutes } from '../../../src/planning/fit/routes';
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
let a: SetupCrew;
let b: SetupCrew;
let plan: SeededPlan;
let places: string[];
let draftDay: string;
let busyPlace: string;

const HOURS = {
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start: '08:00', end: '18:00' }]]),
  ),
};
const busyCurve = Array.from({ length: 24 }, (_, h) =>
  h >= 10 && h < 14 ? 90 : h >= 8 && h < 18 ? 20 : 0,
);

async function insertPlace(
  pool: pg.Pool,
  kyoto: string,
  name: string,
  offset: number,
): Promise<string> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, curation, hours, editorial)
       VALUES ($1, $2, 'temple_shrine', $3, $4, 'editorial', $5, '{"time_needed_min": 90}') RETURNING id`,
      [kyoto, name, 35.0 + offset / 500, 135.77 + offset / 700, JSON.stringify(HOURS)],
    );
    return rows[0]!.id;
  });
}

const post = async (who: SignedIn, tripId: string, body: unknown) => {
  const response = await harness.request(`/v1/trips/${tripId}/fit`, {
    method: 'POST',
    headers: { cookie: who.cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

const get = async (who: SignedIn, path: string) => {
  const response = await harness.request(path, { headers: { cookie: who.cookie } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

type Fits = {
  fits: {
    poi_id: string;
    days: { day_no: number; grade: string; reasons: { code: string }[] }[];
  }[];
};

beforeAll(async () => {
  harness = await startSetupHarness(undefined, (app, deps) => registerFitRoutes(app, deps));
  a = await buildSetupCrew(harness, 2);
  b = await buildSetupCrew(harness, 1);
  const kyoto = (await seedLiveDestinations(harness.pool))['kyoto'] ?? '';
  places = [];
  for (let i = 0; i < 50; i += 1)
    places.push(await insertPlace(harness.pool, kyoto, `Temple ${i}`, i));
  busyPlace = places[0]!;
  await withSystem(harness.pool, async (tx) => {
    await tx.query('UPDATE trips SET destination_id = $1, tz = $2 WHERE id = ANY($3)', [
      kyoto,
      'Asia/Tokyo',
      [a.tripId, b.tripId],
    ]);
    await tx.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
      [a.tripId, a.members[1]!.uid],
    );
    for (let dow = 0; dow < 7; dow += 1) {
      await tx.query(
        `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at, approved_at)
         VALUES ($1, $2, $3::smallint[], 'editorial', now(), NULL)`,
        [busyPlace, dow, busyCurve],
      );
    }
  });
  plan = await seedCurrentPlan(harness.pool, a.tripId);
  draftDay = await withSystem(harness.pool, async (tx) => {
    const version = await tx.query<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'organiser', 'drafting') RETURNING id`,
      [a.tripId],
    );
    const day = await tx.query<{ id: string }>(
      `INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, $3) RETURNING id`,
      [version.rows[0]!.id, a.tripId, plan.dates[2]],
    );
    return day.rows[0]!.id;
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('POST /v1/trips/{id}/fit', () => {
  it('gives a participant each place grade per day, in the wire shape', async () => {
    for (const who of [a.organiser, a.members[1]!]) {
      const { status, body } = await post(who, a.tripId, {
        poi_ids: [places[1]],
        include_context: true,
      });
      expect(status).toBe(200);
      const [fit] = (body as unknown as Fits).fits;
      expect(placeFitSchema.parse(fit)).toEqual(fit);
      expect(fit?.days.map((day) => day.day_no)).toEqual([1, 2, 3]);
      expect(fit?.days[2]?.grade).toBe('good');
      expect(body['context']).toMatchObject({ tz: 'Asia/Tokyo' });
    }
  });

  it('is NOT_FOUND for an outsider and for a member asking about the organiser draft', async () => {
    expect((await post(b.organiser, a.tripId, { poi_ids: [places[1]] })).status).toBe(404);
    expect(
      (await post(a.members[1]!, a.tripId, { poi_ids: [places[1]], day_id: draftDay })).status,
    ).toBe(404);
    const own = await post(a.organiser, a.tripId, { poi_ids: [places[1]], day_id: draftDay });
    expect(own.status).toBe(200);
    expect((own.body as unknown as Fits).fits[0]?.days).toHaveLength(1);
  });

  it('answers fifty places in one request', async () => {
    const started = performance.now();
    const { status, body } = await post(a.members[1]!, a.tripId, { poi_ids: places });
    expect(status).toBe(200);
    expect((body as unknown as Fits).fits).toHaveLength(50);
    expect(performance.now() - started).toBeLessThan(10_000);
    expect((await post(a.organiser, a.tripId, { poi_ids: [...places, randomUUID()] })).status).toBe(
      422,
    );
  });

  it('never lets an unapproved editorial curve shape a fit, and does once approved', async () => {
    const reasons = async () =>
      (
        (await post(a.organiser, a.tripId, { poi_ids: [busyPlace] })).body as unknown as Fits
      ).fits[0]!.days.flatMap((day) => day.reasons.map((reason) => reason.code));
    expect(await reasons()).not.toContain('busy_from');
    await harness.pool.query('UPDATE crowd_forecasts SET approved_at = now() WHERE poi_id = $1', [
      busyPlace,
    ]);
    expect(await reasons()).toContain('busy_from');
  });
});

describe('nearby places and gap ideas', () => {
  it('lists curated places near a place by minutes, nearest first', async () => {
    const { status, body } = await get(
      a.organiser,
      `/v1/trips/${a.tripId}/places/${places[0]}/nearby?limit=5`,
    );
    expect(status).toBe(200);
    const list = body['places'] as { poi_id: string; minutes: number }[];
    expect(list).toHaveLength(5);
    expect(list.map((p) => p.minutes)).toEqual(
      [...list.map((p) => p.minutes)].sort((x, y) => x - y),
    );
    expect(list.map((p) => p.poi_id)).not.toContain(places[0]);
    expect(
      (await get(b.organiser, `/v1/trips/${a.tripId}/places/${places[0]}/nearby`)).status,
    ).toBe(404);
  });

  it('fills the free third day with up to three ideas', async () => {
    const dayId = (
      await harness.pool.query<{ id: string }>(
        'SELECT id FROM plan_days WHERE version_id = $1 AND day_no = 3',
        [plan.versionId],
      )
    ).rows[0]!.id;
    const { status, body } = await get(
      a.organiser,
      `/v1/trips/${a.tripId}/gaps/ideas?day_id=${dayId}&start=07:00&end=22:00`,
    );
    expect(status).toBe(200);
    const result = gapIdeasResultSchema.parse(body);
    expect(result.ideas.length).toBeGreaterThan(0);
    expect(result.ideas.length).toBeLessThanOrEqual(3);
    expect(result.who_free).toEqual(expect.arrayContaining([a.organiser.uid]));
  });

  it('draws both from the machine picks where nothing is curated', async () => {
    const nearby = async () =>
      (
        (await get(a.organiser, `/v1/trips/${a.tripId}/places/${places[0]}/nearby?limit=5`)).body[
          'places'
        ] as { poi_id: string }[]
      ).map((place) => place.poi_id);
    const curated = await nearby();
    // The same places as open data the pick job chose, and one beside the first nobody picked.
    await harness.pool.query(
      `UPDATE pois p SET curation = 'auto', pick_rank = r.n, pick_source = 'fill'
         FROM (SELECT id, (row_number() OVER (ORDER BY name, id))::int AS n FROM pois
                WHERE destination_id = (SELECT destination_id FROM pois WHERE id = $1)
                  AND curation = 'editorial') r
        WHERE p.id = r.id`,
      [places[0]],
    );
    const { rows } = await harness.pool.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       SELECT destination_id, 'Unpicked temple', category, lat + 0.00001, lng FROM pois WHERE id = $1
       RETURNING id`,
      [places[0]],
    );
    const picked = await nearby();
    expect(picked).toEqual(curated);
    expect(picked).not.toContain(rows[0]!.id);

    const dayId = (
      await harness.pool.query<{ id: string }>(
        'SELECT id FROM plan_days WHERE version_id = $1 AND day_no = 3',
        [plan.versionId],
      )
    ).rows[0]!.id;
    const ideas = gapIdeasResultSchema.parse(
      (
        await get(
          a.organiser,
          `/v1/trips/${a.tripId}/gaps/ideas?day_id=${dayId}&start=07:00&end=22:00`,
        )
      ).body,
    );
    expect(ideas.ideas.length).toBeGreaterThan(0);
    expect(JSON.stringify(ideas)).not.toContain(rows[0]!.id);
  });
});
