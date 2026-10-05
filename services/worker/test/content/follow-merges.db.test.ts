/**
 * Rows that name a merged place follow it, on the real schema: publishing a places release that
 * merges a wrongly pinned record moves a trip's stop, must-do and idea to the kept record, drops
 * the stop's stored legs and queues the trip's legs and check, and the legs job then stores the
 * way from the right pin; a day, an ideas list and a saved list that would hold the place twice
 * keep one; a trip under way is corrected with both of its stops and their times as they were;
 * the operator run counts first without writing, and running it again moves nothing.
 */
import { randomUUID } from 'node:crypto';

import { buildRelease, type ContentItem } from '@cp/content';
import { withSystem } from '@cp/db';
import { createPlanningTravel } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { publishRelease } from '../../src/content';
import { followMerges } from '../../src/content/follow-merges-cli';
import { planCheckJob } from '../../src/jobs/planning/check';
import { planLegsJob, refreshTripLegs } from '../../src/jobs/planning/legs/job';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';
import { insertCrew, insertTripUnderWay, insertUser } from '../notify-fixtures';

let harness: JobsHarness;
let destinationId: string;
let people: string[];
const travel = createPlanningTravel({ valhalla: null });
const bali = (time: string) => new Date(`2026-11-02T${time}:00+08:00`);

async function one(sql: string, values: unknown[] = []): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no row from ${sql}`);
  return id;
}

/** A place record with its own source id, so a release can name it. */
const place = (ref: string, name: string, lat: number, lng: number) =>
  one(
    `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids)
     VALUES ($1, $2, 'temple_shrine', $3, $4, jsonb_build_object('fsq_os', $5::text)) RETURNING id`,
    [destinationId, name, lat, lng, ref],
  );

/** The same place twice: `wrong` is the record to merge (15 km off), `kept` the one at the temple. */
async function twins(): Promise<{ wrong: string; kept: string; ref: string }> {
  const ref = randomUUID().slice(0, 8);
  return {
    ref,
    wrong: await place(`${ref}-wrong`, 'Tirta Empul', -8.5506, 115.3003),
    kept: await place(`${ref}-kept`, 'Pura Tirta Empul', -8.4153, 115.3154),
  };
}

const merge = (pair: { wrong: string; kept: string }) =>
  harness.pool.query('UPDATE pois SET merged_into_id = $2 WHERE id = $1', [pair.wrong, pair.kept]);

interface Plan {
  readonly tripId: string;
  readonly versionId: string;
  readonly dayId: string;
}

async function plan(tripId: string): Promise<Plan> {
  const versionId = await one(
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
     RETURNING id`,
    [tripId],
  );
  const dayId = await one(
    `INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, '2026-11-02')
     RETURNING id`,
    [versionId, tripId],
  );
  await harness.pool.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [
    tripId,
    versionId,
  ]);
  return { tripId, versionId, dayId };
}

const planningTrip = async () =>
  plan(
    await one(
      `INSERT INTO trips (crew_id, status, destination_id, tz)
       VALUES ($1, 'setup', $2, 'Asia/Makassar') RETURNING id`,
      [await insertCrew(harness.pool, people), destinationId],
    ),
  );

async function stop(at: Plan, poiId: string, from: string, to: string): Promise<string> {
  const stable = randomUUID();
  await harness.pool.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
       poi_id, category)
     VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Makassar', $7, 'activity')`,
    [at.versionId, at.dayId, at.tripId, stable, bali(from), bali(to), poiId],
  );
  return stable;
}

const stopsOf = async (at: Plan) =>
  (
    await harness.pool.query<{ stable_id: string; poi_id: string; starts_at: Date }>(
      'SELECT stable_id, poi_id, starts_at FROM plan_items WHERE version_id = $1 ORDER BY starts_at',
      [at.versionId],
    )
  ).rows;

const idea = (tripId: string, poiId: string, backer: string, source: string) =>
  one(
    `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, backer_ids, sources)
     SELECT $1, id, name, category, lat, lng, ARRAY[$3::uuid], ARRAY[$4::text] FROM pois
      WHERE id = $2 RETURNING id`,
    [tripId, poiId, backer, source],
  );

beforeAll(async () => {
  harness = await startJobsHarness();
  // The queues exist; nothing works them here, the test runs the legs job itself.
  await harness.startRuntime([planLegsJob(travel), planCheckJob()]);
  await harness.stopAll();
  people = [await insertUser(harness.pool), await insertUser(harness.pool)];
  destinationId = await one(
    `INSERT INTO destinations (slug, name, coverage, tz)
     VALUES ('bali', 'Bali', 'live', 'Asia/Makassar') RETURNING id`,
  );
}, 240_000);

afterAll(() => harness?.close());

describe('publishing a places release that merges a record', () => {
  it('moves the stop, the must-do and the idea to the kept record and has the legs made again', async () => {
    const temple = await twins();
    const lunch = await place(randomUUID().slice(0, 8), 'Warung Dekat', -8.4201, 115.3122);
    const trip = await planningTrip();
    const visit = await stop(trip, temple.wrong, '09:00', '10:30');
    const meal = await stop(trip, lunch, '12:00', '13:00');
    await refreshTripLegs(harness.pool, travel, trip.tripId);
    const before = await harness.pool.query<{ meters: number }>(
      'SELECT meters FROM plan_legs WHERE version_id = $1 AND from_key = $2 AND to_key = $3',
      [trip.versionId, visit, meal],
    );
    expect(before.rows[0]?.meters).toBeGreaterThan(10_000);
    const mustDo = await one(
      `INSERT INTO must_dos (trip_id, owner_id, title, poi_id) VALUES ($1, $2, 'Tirta Empul', $3)
       RETURNING id`,
      [trip.tripId, people[0], temple.wrong],
    );
    const saved = await idea(trip.tripId, temple.wrong, people[0]!, 'save');

    const item = (ref: string, name: string, into: string | null): ContentItem<'places'> => ({
      ref: `fsq_os:${ref}`,
      destination: 'bali',
      name,
      name_local: null,
      category: 'temple_shrine',
      lat: -8.4153,
      lng: 115.3154,
      address: null,
      tz: 'Asia/Makassar',
      tags: ['temples'],
      hours: null,
      licence: {
        source: 'fsq_os',
        source_id: ref,
        licence: 'Apache-2.0',
        attribution: 'Foursquare Open Source Places',
      },
      editorial: {
        why_go: 'A water temple fed by a holy spring.',
        best_time: 'Early morning',
        time_needed_min: 90,
        crowd_hint: 'Busy by ten',
        etiquette: 'Wear a sarong.',
      },
      merge_into: into === null ? null : `fsq_os:${into}`,
      possible_duplicate_of: null,
    });
    const owner = people[0]!;
    const artifact = buildRelease({
      kind: 'places',
      version: 1,
      items: [
        item(`${temple.ref}-kept`, 'Pura Tirta Empul', null),
        item(`${temple.ref}-wrong`, 'Tirta Empul', `${temple.ref}-kept`),
      ],
      generated_by: {
        batch_key: 'places-1',
        route: null,
        model: null,
        generated_at: '2026-10-05T00:00:00.000Z',
      },
      approved_by: owner,
    });
    const releaseId = await one(
      `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum,
         artifact, item_count, approved_by, approved_at)
       VALUES ('places', 1, $1, $1, 'approved', 'approve', $2, $3, 2, $4, now()) RETURNING id`,
      [`places-1-${randomUUID()}`, artifact.checksum, JSON.stringify(artifact), owner],
    );
    const published = await withSystem(harness.pool, (tx) => publishRelease(tx, releaseId));
    expect(published.follows?.tables).toMatchObject({
      plan_items: { moved: 1, dropped: 0 },
      must_dos: { moved: 1, dropped: 0 },
      trip_ideas: { moved: 1, dropped: 0 },
    });
    expect(published.follows?.replanned).toEqual([trip.tripId]);

    // The stop is the same stop at the same time, at the kept record.
    expect(await stopsOf(trip)).toEqual([
      { stable_id: visit, poi_id: temple.kept, starts_at: bali('09:00') },
      { stable_id: meal, poi_id: lunch, starts_at: bali('12:00') },
    ]);
    const named = await harness.pool.query<{ name: string | null }>(
      `SELECT coverage -> 'places' -> $2 ->> 'name' AS name FROM itinerary_versions WHERE id = $1`,
      [trip.versionId, temple.kept],
    );
    expect(named.rows[0]?.name).toBe('Pura Tirta Empul');
    expect(
      (await harness.pool.query('SELECT poi_id FROM must_dos WHERE id = $1', [mustDo])).rows,
    ).toEqual([{ poi_id: temple.kept }]);
    const moved = await harness.pool.query<{ poi_id: string; lat: number; deleted: boolean }>(
      'SELECT poi_id, lat, deleted_at IS NOT NULL AS deleted FROM trip_ideas WHERE id = $1',
      [saved],
    );
    expect(moved.rows[0]).toEqual({ poi_id: temple.kept, lat: -8.4153, deleted: false });

    // The way from the old pin is gone, and one legs run and one check are waiting for the trip.
    const stale = await harness.pool.query(
      'SELECT 1 FROM plan_legs WHERE version_id = $1 AND (from_key = $2 OR to_key = $2)',
      [trip.versionId, visit],
    );
    expect(stale.rowCount).toBe(0);
    const queued = await harness.pool.query<{ name: string }>(
      `SELECT name FROM pgboss.job WHERE data ->> 'trip_id' = $1 ORDER BY name`,
      [trip.tripId],
    );
    expect(queued.rows.map((row) => row.name)).toEqual(['plan.check', 'plan.legs']);
    await refreshTripLegs(harness.pool, travel, trip.tripId);
    const after = await harness.pool.query<{ meters: number }>(
      'SELECT meters FROM plan_legs WHERE version_id = $1 AND from_key = $2 AND to_key = $3',
      [trip.versionId, visit, meal],
    );
    expect(after.rows[0]?.meters).toBeLessThan(2000);
  });
});

describe('rows left behind by an earlier release', () => {
  it('counts first without writing, then keeps one where the place would be there twice', async () => {
    const temple = await twins();
    const trip = await planningTrip();
    const early = await stop(trip, temple.wrong, '09:00', '10:30');
    const late = await stop(trip, temple.kept, '14:00', '15:30');
    const mustDo = await one(
      `INSERT INTO must_dos (trip_id, owner_id, title, poi_id) VALUES ($1, $2, 'Tirta Empul', $3)
       RETURNING id`,
      [trip.tripId, people[0], temple.wrong],
    );
    await harness.pool.query('UPDATE plan_items SET must_do_id = $2 WHERE stable_id = $1', [
      early,
      mustDo,
    ]);
    await idea(trip.tripId, temple.wrong, people[0]!, 'save');
    const keptIdea = await idea(trip.tripId, temple.kept, people[1]!, 'swipe');
    for (const poiId of [temple.wrong, temple.kept]) {
      await harness.pool.query(
        "INSERT INTO saved_items (user_id, kind, ref_id) VALUES ($1, 'place', $2)",
        [people[0], poiId],
      );
    }
    await harness.pool.query('INSERT INTO place_hides (user_id, poi_id) VALUES ($1, $2)', [
      people[1],
      temple.wrong,
    ]);
    await merge(temple);

    const lines: string[] = [];
    const dry = await followMerges(harness.pool, { dryRun: true, log: (line) => lines.push(line) });
    expect(dry.tables).toMatchObject({
      plan_items: { moved: 0, dropped: 1 },
      must_dos: { moved: 1, dropped: 0 },
      trip_ideas: { moved: 0, dropped: 1 },
      saved_items: { moved: 0, dropped: 1 },
      place_hides: { moved: 1, dropped: 0 },
    });
    expect(dry.failed).toEqual({});
    expect(dry.trips[trip.tripId]).toBe(3);
    expect(lines.join('\n')).toContain('plan_items: 0 would move, 1 not kept');
    expect(await stopsOf(trip)).toHaveLength(2);

    const done = await followMerges(harness.pool, { log: () => undefined });
    expect(done.tables).toEqual(dry.tables);
    // One stop, the one that was already at the temple, now carrying the must-do.
    const left = await harness.pool.query<{ stable_id: string; must_do_id: string | null }>(
      'SELECT stable_id, must_do_id FROM plan_items WHERE version_id = $1',
      [trip.versionId],
    );
    expect(left.rows).toEqual([{ stable_id: late, must_do_id: mustDo }]);
    const ideas = await harness.pool.query<{ id: string; backer_ids: string[]; sources: string[] }>(
      'SELECT id, backer_ids, sources FROM trip_ideas WHERE trip_id = $1 AND deleted_at IS NULL',
      [trip.tripId],
    );
    expect(ideas.rows).toHaveLength(1);
    expect(ideas.rows[0]?.id).toBe(keptIdea);
    expect([...(ideas.rows[0]?.backer_ids ?? [])].sort()).toEqual([...people].sort());
    expect([...(ideas.rows[0]?.sources ?? [])].sort()).toEqual(['save', 'swipe']);
    const saves = await harness.pool.query<{ ref_id: string }>(
      "SELECT ref_id FROM saved_items WHERE user_id = $1 AND kind = 'place' AND ref_id = ANY($2::uuid[])",
      [people[0], [temple.wrong, temple.kept]],
    );
    expect(saves.rows).toEqual([{ ref_id: temple.kept }]);
    const hides = await harness.pool.query<{ poi_id: string }>(
      'SELECT poi_id FROM place_hides WHERE user_id = $1 AND poi_id = ANY($2::uuid[])',
      [people[1], [temple.wrong, temple.kept]],
    );
    expect(hides.rows).toEqual([{ poi_id: temple.kept }]);

    const again = await followMerges(harness.pool, { log: () => undefined });
    expect(Object.values(again.tables).every((count) => count.moved + count.dropped === 0)).toBe(
      true,
    );
    expect(again.replanned).toEqual([]);
  });

  it('corrects a trip under way and leaves its stops and their times as they were', async () => {
    const temple = await twins();
    const tripId = await insertTripUnderWay(
      harness.pool,
      await insertCrew(harness.pool, people),
      'Asia/Makassar',
      people,
    );
    const trip = await plan(tripId);
    const early = await stop(trip, temple.wrong, '09:00', '10:30');
    const late = await stop(trip, temple.kept, '14:00', '15:30');
    await merge(temple);
    const done = await followMerges(harness.pool, { log: () => undefined });
    expect(done.tables['plan_items']).toEqual({ moved: 1, dropped: 0 });
    expect(await stopsOf(trip)).toEqual([
      { stable_id: early, poi_id: temple.kept, starts_at: bali('09:00') },
      { stable_id: late, poi_id: temple.kept, starts_at: bali('14:00') },
    ]);
    expect(done.replanned).toEqual([tripId]);
  });
});
