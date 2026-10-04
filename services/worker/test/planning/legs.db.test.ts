/**
 * Stored legs on the real schema, routed through recorded Valhalla answers for an Ubud day: the
 * stay starts and ends the day, stops go in time order whoever attends them, a short hop is a
 * walk and the rest are drives scaled by the destination's drive factor; with no router every leg
 * is an "about" estimate; routed legs keep the road they follow and straight-line ones none; a
 * replay writes nothing; legs leave with a superseded version; and a plan event queues one
 * debounced run per trip. A stay that is booked but not on the plan anchors
 * the legs and the plan check alike.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { decodePolyline, PLAN_LEG_SHAPE_PRECISION, type LngLat } from '@cp/domain';
import { createPlanningTravel, createValhallaClient } from '@cp/suppliers';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { replayValhalla } from '../../../../packages/suppliers/src/valhalla/fixtures/replay';
import { loadCheck, readCheckTrip } from '../../src/jobs/planning/check/context';
import { legsEventHook } from '../../src/jobs/planning/legs';
import { queueLegsBackfill } from '../../src/jobs/planning/legs/backfill-queue';
import { planLegsJob, refreshTripLegs } from '../../src/jobs/planning/legs/job';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let owner: string;
let destinationId: string;
const poi: Record<'stay' | 'temple' | 'terraces' | 'spring', string> = {
  stay: '',
  temple: '',
  terraces: '',
  spring: '',
};

const ubud = (hour: number) => `2026-11-02T${String(hour).padStart(2, '0')}:00:00+08:00`;

async function one(sql: string, values: unknown[]): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no row from ${sql}`);
  return id;
}

interface SeededDay {
  readonly tripId: string;
  readonly versionId: string;
  readonly stops: Record<'temple' | 'terraces' | 'spring', string>;
}

/** A trip staying at Komaneka with one planned Ubud day, its stops inserted out of time order. */
async function seedDay(status = 'current'): Promise<SeededDay> {
  const crew = await one('INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id', [
    'Ubud',
    owner,
  ]);
  const tripId = await one(
    `INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'setup', $2) RETURNING id`,
    [crew, destinationId],
  );
  await harness.pool.query(
    `INSERT INTO bookings (trip_id, owner_id, type, title, starts_at, ends_at, tz, visibility)
     VALUES ($1, $2, 'stay', 'Komaneka Ubud', '2026-11-01T14:00:00+08:00',
             '2026-11-05T11:00:00+08:00', 'Asia/Makassar', 'crew')`,
    [tripId, owner],
  );
  const versionId = await one(
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', $2)
     RETURNING id`,
    [tripId, status],
  );
  const dayId = await one(
    `INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, '2026-11-02')
     RETURNING id`,
    [versionId, tripId],
  );
  const stops = { temple: randomUUID(), terraces: randomUUID(), spring: randomUUID() };
  const item = (stable: string, poiId: string, hour: number, attendees: string[] | null) =>
    harness.pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
         poi_id, attendee_ids)
       VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Makassar', $7, $8)`,
      [versionId, dayId, tripId, stable, ubud(hour), ubud(hour + 1), poiId, attendees],
    );
  await item(stops.spring, poi.spring, 14, null);
  await item(stops.temple, poi.temple, 9, null);
  await item(stops.terraces, poi.terraces, 11, [owner]);
  if (status === 'current') {
    await harness.pool.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [
      tripId,
      versionId,
    ]);
  }
  return { tripId, versionId, stops };
}

function recordedRouter() {
  const recorded = replayValhalla('bali-day-legs');
  return createValhallaClient({ baseUrl: 'http://valhalla.test:8002', fetch: recorded.fetch });
}

function recordedTravel() {
  return createPlanningTravel({ valhalla: recordedRouter() });
}

/** Routes the day through the recorded answers, road shapes included. */
function refreshRouted(tripId: string) {
  const router = recordedRouter();
  return refreshTripLegs(harness.pool, createPlanningTravel({ valhalla: router }), tripId, router);
}

function metresApart(a: LngLat, b: LngLat): number {
  const dx = (a[0] - b[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180);
  const dy = (a[1] - b[1]) * 111_320;
  return Math.hypot(dx, dy);
}

interface LegRow {
  from_key: string;
  to_key: string;
  mode: string;
  minutes: number;
  source: string;
  approx: boolean;
  shape: string | null;
  updated_at: Date;
}

async function legsOf(versionId: string): Promise<LegRow[]> {
  const { rows } = await harness.pool.query<LegRow>(
    `SELECT from_key, to_key, mode, minutes, source, approx, shape, updated_at FROM plan_legs
      WHERE version_id = $1 ORDER BY computed_at, from_key`,
    [versionId],
  );
  return rows;
}

beforeAll(async () => {
  harness = await startJobsHarness();
  owner = randomUUID();
  await harness.pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [owner]);
  destinationId = await one(
    `INSERT INTO destinations (slug, name, coverage, tz, drive_factor)
     VALUES ('bali', 'Bali', 'live', 'Asia/Makassar', 1.3) RETURNING id`,
    [],
  );
  const place = (name: string, category: string, lat: number, lng: number) =>
    one(
      `INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [destinationId, name, category, lat, lng],
    );
  poi.stay = await place('Komaneka Ubud', 'stay', -8.5069, 115.2625);
  poi.temple = await place('Pura Taman Saraswati', 'temple_shrine', -8.5064, 115.2617);
  poi.terraces = await place('Tegallalang Rice Terrace', 'nature', -8.4338, 115.2789);
  poi.spring = await place('Pura Tirta Empul', 'temple_shrine', -8.4153, 115.3154);
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness?.close();
});

describe('plan.legs', () => {
  it('routes the day from the stay and back, in time order, walking the short hop', async () => {
    const day = await seedDay();
    const result = await refreshTripLegs(harness.pool, recordedTravel(), day.tripId);
    expect(result).toMatchObject({ versions: 1, legs: 4, approx: 0 });
    const legs = await legsOf(day.versionId);
    const byPair = new Map(legs.map((leg) => [`${leg.from_key}>${leg.to_key}`, leg]));
    const { temple, terraces, spring } = day.stops;
    expect([...byPair.keys()].sort()).toEqual(
      [`stay>${temple}`, `${temple}>${terraces}`, `${terraces}>${spring}`, `${spring}>stay`].sort(),
    );
    expect(byPair.get(`stay>${temple}`)).toMatchObject({ mode: 'walk', source: 'valhalla' });
    // 17 free-flow minutes × Bali's 1.3 drive factor.
    expect(byPair.get(`${temple}>${terraces}`)).toMatchObject({ mode: 'drive', minutes: 22 });
    expect(legs.every((leg) => !leg.approx)).toBe(true);

    const { rows } = await harness.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM domain_events
        WHERE type = 'plan.legs_updated' AND payload ->> 'version_id' = $1`,
      [day.versionId],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('keeps the road each routed leg follows for its mode', async () => {
    const day = await seedDay();
    await refreshRouted(day.tripId);
    const legs = await legsOf(day.versionId);
    const byPair = new Map(legs.map((leg) => [`${leg.from_key}>${leg.to_key}`, leg]));
    const { temple, terraces, spring } = day.stops;
    const komaneka: LngLat = [115.2625, -8.5069];
    const tegallalang: LngLat = [115.2789, -8.4338];
    // The walk keeps the footpath; the drives, chained into one route, keep the roads.
    for (const [pair, from, to] of [
      [`stay>${temple}`, komaneka, [115.2617, -8.5064]],
      [`${temple}>${terraces}`, [115.2617, -8.5064], tegallalang],
      [`${spring}>stay`, [115.3154, -8.4153], komaneka],
    ] as const) {
      const shape = byPair.get(pair)?.shape;
      if (shape == null) throw new Error(`no shape for ${pair}`);
      const points = decodePolyline(shape, PLAN_LEG_SHAPE_PRECISION);
      expect(points.length).toBeGreaterThan(2);
      expect(points.length).toBeLessThanOrEqual(200);
      expect(metresApart(points[0] as LngLat, from)).toBeLessThan(150);
      expect(metresApart(points.at(-1) as LngLat, to)).toBeLessThan(150);
    }
    expect(typeof byPair.get(`${terraces}>${spring}`)?.shape).toBe('string');
  });

  it('stores about-minutes and no road when no router answers', async () => {
    const day = await seedDay();
    await refreshTripLegs(harness.pool, createPlanningTravel({ valhalla: null }), day.tripId);
    const legs = await legsOf(day.versionId);
    expect(legs).toHaveLength(4);
    expect(legs.every((leg) => leg.approx && leg.source === 'straight_line')).toBe(true);
    expect(legs.every((leg) => leg.shape === null)).toBe(true);
  });

  it('backfills road shapes onto legs already stored without them', async () => {
    const day = await seedDay();
    await refreshTripLegs(harness.pool, recordedTravel(), day.tripId);
    expect((await legsOf(day.versionId)).every((leg) => leg.shape === null)).toBe(true);
    const missing = () =>
      queueLegsBackfill(harness.pool, { dryRun: true, missingShapes: true }).then((r) => r.trips);
    const before = await missing();
    expect(before).toBeGreaterThan(0);

    const result = await refreshRouted(day.tripId);
    expect(result.changed).toBe(4);
    expect((await legsOf(day.versionId)).every((leg) => leg.shape !== null)).toBe(true);
    expect(await missing()).toBe(before - 1);
    // A new road alone does not ask the plan check again.
    const { rows } = await harness.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM domain_events
        WHERE type = 'plan.legs_updated' AND payload ->> 'version_id' = $1`,
      [day.versionId],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('writes nothing on a replay', async () => {
    const day = await seedDay();
    await refreshRouted(day.tripId);
    const before = await legsOf(day.versionId);
    expect(before.every((leg) => leg.shape !== null)).toBe(true);
    const again = await refreshRouted(day.tripId);
    expect(again.changed).toBe(0);
    expect(await legsOf(day.versionId)).toEqual(before);
  });

  it('keeps legs for drafts and drops them when a version is superseded', async () => {
    const day = await seedDay('draft');
    await refreshTripLegs(harness.pool, recordedTravel(), day.tripId);
    expect(await legsOf(day.versionId)).toHaveLength(4);
    await harness.pool.query("UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1", [
      day.versionId,
    ]);
    await refreshTripLegs(harness.pool, recordedTravel(), day.tripId);
    expect(await legsOf(day.versionId)).toEqual([]);
  });

  it('queues one debounced run per trip when the plan changes', async () => {
    const day = await seedDay();
    await harness.startRuntime([planLegsJob(createPlanningTravel({ valhalla: null }))]);
    await withSystem(harness.pool, async (tx) => {
      await legsEventHook(tx, { type: 'plan.ops_applied', tripId: day.tripId });
      await legsEventHook(tx, { type: 'chat.message_sent', tripId: day.tripId });
    });
    const { rows } = await harness.pool.query<{ data: unknown; key: string; later: boolean }>(
      `SELECT data, singleton_key AS key, start_after > now() + interval '20 seconds' AS later
         FROM pgboss.job WHERE name = 'plan.legs' AND data ->> 'trip_id' = $1`,
      [day.tripId],
    );
    expect(rows).toEqual([
      {
        data: { trip_id: day.tripId, version_id: day.versionId },
        key: `legs:${day.tripId}`,
        later: true,
      },
    ]);
  });

  it('anchors the legs and the plan check on a booked stay the plan does not have', async () => {
    const day = await seedDay();
    await refreshTripLegs(harness.pool, createPlanningTravel({ valhalla: null }), day.tripId);
    const fromStay = (await legsOf(day.versionId)).filter((leg) => leg.from_key === 'stay');
    expect(fromStay.map((leg) => leg.to_key)).toEqual([day.stops.temple]);

    const check = await withSystem(harness.pool, async (tx) => {
      const trip = await readCheckTrip(tx, day.tripId);
      if (trip === null) throw new Error('no trip');
      return loadCheck(tx, trip, new Date('2026-10-20T00:00:00Z'));
    });
    expect(check.context.days[0]?.stay).toEqual({ lat: -8.5069, lng: 115.2625 });
  });
});
