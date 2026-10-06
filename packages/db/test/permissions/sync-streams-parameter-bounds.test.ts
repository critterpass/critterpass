/**
 * What one phone's sync connection costs PowerSync, counted the way the service counts it. The
 * pinned service allows 1,000 parameter results (every lookup row, before de-duplication, again
 * for each query shape and each subscription) and 1,000 buckets per connection; past either, the
 * whole sync request fails (PSYNC_S2305) and nothing syncs. The limit stays at its default, so a
 * stream that grows fails here and not on a phone.
 *
 * The replay compiles the generated stream file with the service's own compiler, indexes every
 * published row of the test database and asks the compiler's querier for each subscription the
 * phone holds by design: two trips in the offline window, one on screen, one kept after its screen
 * let go (every trip stream each) and the wallet's trip (`trip` only), plus the destinations being
 * browsed. Other crews' data seeds more than 1,000 candidates for every lookup that once filtered
 * by a catalogue-wide key, so no lookup may grow with anyone else's data.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { insertCrewMember, insertUser } from '../helpers/actors';
import {
  startParameterReplay,
  startStreamHarness,
  type HeldSubscription,
  type ParameterCost,
  type ParameterReplay,
  type StreamHarness,
} from '../helpers/stream-harness';

const CANDIDATES = 1_100;
/** Group edits on the fixture trip; each one superseded the version before it. */
const SUPERSEDED = 300;
/**
 * The one lookup that still grows by one result per edit: the trip stream's change sets. Phones keep
 * every change set (chat cards and the review read applied ones, whose base is superseded), and only
 * the base version's visibility tells a crew change set from an organiser draft's. The compiler
 * splits that query's `OR` into two variants, so each edit costs two results.
 */
const HISTORY_GROWTH = 2 * SUPERSEDED;
const TRIP_STREAMS = ['trip', 'trip_pack', 'trip_me', 'trip_draft'] as const;

interface Shape {
  readonly crews: number;
  readonly coMembers: number;
  readonly trips: number;
  /** Stops and live ideas of each of the first `planned` trips. */
  readonly stops: number;
  readonly ideas: number;
  readonly planned: number;
  readonly browsed: number;
}

const SHAPES = {
  founder: { crews: 5, coMembers: 12, trips: 6, stops: 43, ideas: 6, planned: 1, browsed: 0 },
  heavy: { crews: 12, coMembers: 80, trips: 5, stops: 120, ideas: 150, planned: 5, browsed: 3 },
} as const satisfies Record<string, Shape>;
type ShapeName = keyof typeof SHAPES;

/**
 * Half of each limit. They apply once a trip's places sync as one card each instead of one lookup
 * per place; until then {@link TODAY} records what the current streams cost, and guards it.
 */
const BUDGET: Record<ShapeName, ParameterCost> = {
  founder: { results: 400, buckets: 500 },
  heavy: { results: 500, buckets: 300 },
};
const TODAY: Record<ShapeName, ParameterCost> = {
  founder: { results: 422, buckets: 211 },
  heavy: { results: 1_614, buckets: 2_409 },
};

async function insertDestination(tx: pg.PoolClient): Promise<string> {
  const slug = `bounds-${randomUUID().slice(0, 8)}`;
  const { rows } = await tx.query<{ id: string }>(
    "INSERT INTO destinations (slug, name) VALUES ($1, 'Bounds') RETURNING id",
    [slug],
  );
  return rows[0]!.id;
}

/** A live crew plan of `stops` places and `ideas` saved places on the trip. */
async function insertPlan(tx: pg.PoolClient, tripId: string, dest: string, shape: Shape) {
  await tx.query(
    `WITH v AS (
       INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
       RETURNING id),
     d AS (INSERT INTO plan_days (version_id, trip_id, day_no) SELECT id, $1, 1 FROM v
       RETURNING id, version_id),
     p AS (INSERT INTO pois (destination_id, name, category, lat, lng, status, curation)
       SELECT $2, 'Stop ' || n, 'other', 1, 1, 'active', 'auto' FROM generate_series(1, $3) AS n
       RETURNING id)
     INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, category, poi_id)
     SELECT d.version_id, d.id, $1, uuidv7(), 'sightseeing', p.id FROM d CROSS JOIN p`,
    [tripId, dest, shape.stops],
  );
  await tx.query(
    `WITH p AS (INSERT INTO pois (destination_id, name, category, lat, lng, status, curation)
       SELECT $2, 'Idea ' || n, 'other', 1, 1, 'active', 'auto' FROM generate_series(1, $3) AS n
       RETURNING id)
     INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, sources)
     SELECT $1, id, 'Idea', 'other', 1, 1, ARRAY['save'] FROM p`,
    [tripId, dest, shape.ideas],
  );
}

async function seedCaller(pool: pg.Pool, shape: Shape) {
  return withSystem(pool, async (tx) => {
    const userId = await insertUser(tx);
    const crews = await tx.query<{ id: string }>(
      `INSERT INTO crews (name, created_by) SELECT 'Shape ' || n, $1 FROM generate_series(1, $2) AS n
       RETURNING id`,
      [userId, shape.crews],
    );
    const crewIds = crews.rows.map((row) => row.id);
    for (const crewId of crewIds) await insertCrewMember(tx, { crewId, userId, role: 'organiser' });
    for (let i = 0; i < shape.coMembers; i += 1) {
      const coMember = await insertUser(tx);
      await insertCrewMember(tx, { crewId: crewIds[i % crewIds.length]!, userId: coMember });
    }
    const dest = await insertDestination(tx);
    const tripIds: string[] = [];
    for (let i = 0; i < shape.trips; i += 1) {
      const trip = await tx.query<{ id: string }>(
        "INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'voting', $2) RETURNING id",
        [crewIds[i % crewIds.length], dest],
      );
      tripIds.push(trip.rows[0]!.id);
      if (i < shape.planned) await insertPlan(tx, trip.rows[0]!.id, dest, shape);
    }
    const destinationIds: string[] = [];
    for (let i = 0; i < shape.browsed; i += 1) destinationIds.push(await insertDestination(tx));
    return { userId, tripIds, destinationIds };
  });
}

/** The subscriptions a phone holds by design: four trips fully, the wallet's fifth, browsing. */
function heldByDesign(caller: Caller): HeldSubscription[] {
  const [first, second, third, fourth, wallet] = caller.tripIds;
  const full = [first, second, third, fourth].filter((id) => id !== undefined);
  return [
    ...full.flatMap((trip_id) =>
      TRIP_STREAMS.map((stream) => ({ stream, parameters: { trip_id } })),
    ),
    ...(wallet === undefined ? [] : [{ stream: 'trip', parameters: { trip_id: wallet } }]),
    ...caller.destinationIds.map((destination_id) => ({
      stream: 'explore',
      parameters: { destination_id },
    })),
  ];
}

let harness: StreamHarness;
let replay: ParameterReplay;
/** The same database before the fixture trip's edit history was written. */
let replayBeforeHistory: ParameterReplay;
type Caller = Awaited<ReturnType<typeof seedCaller>>;
const callers = new Map<ShapeName, Caller>();
/** In the fixture trip's crew and in thirty more; `single` is in the fixture trip's crew alone. */
let busy: string;
let single: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { fixture, db } = harness;
  await withSystem(db.pool, async (tx) => {
    const outsider = fixture.actors.outsider;
    const crew = await tx.query<{ id: string }>(
      "INSERT INTO crews (name, created_by) VALUES ('Elsewhere', $1) RETURNING id",
      [outsider],
    );
    // Other crews' trips, each with a crew and an organiser plan version, a group guide thread
    // and a boost: the rows the catalogue-wide lookups used to return.
    await tx.query(
      `WITH made AS (
         INSERT INTO trips (crew_id, status) SELECT $1, 'voting' FROM generate_series(1, $2)
         RETURNING id),
       versions AS (
         INSERT INTO itinerary_versions (trip_id, visibility, status)
         SELECT id, v, 'draft' FROM made CROSS JOIN (VALUES ('crew'), ('organiser')) AS vis(v)),
       threads AS (
         INSERT INTO guide_threads (user_id, trip_id, crew_id, mode)
         SELECT $3, id, $1, 'group' FROM made)
       INSERT INTO trip_entitlements (trip_id, boost_active) SELECT id, true FROM made`,
      [crew.rows[0]!.id, CANDIDATES, outsider],
    );
    // The fixture trip's destination, with more places than one connection may hold results for,
    // each with a crowd forecast.
    const dest = await insertDestination(tx);
    await tx.query('UPDATE trips SET destination_id = $1 WHERE id = $2', [dest, fixture.tripId]);
    await tx.query(
      `WITH made AS (
         INSERT INTO pois (destination_id, name, category, lat, lng, status, curation)
         SELECT $1, 'POI ' || n, 'other', 1, 1, 'active', 'editorial'
           FROM generate_series(1, $2) AS n
         RETURNING id)
       INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at)
       SELECT id, 0, array_fill(10::smallint, ARRAY[24]), 'besttime', now() FROM made`,
      [dest, CANDIDATES],
    );
    busy = await insertUser(tx);
    single = await insertUser(tx);
    await insertCrewMember(tx, { crewId: fixture.crewId, userId: busy });
    await insertCrewMember(tx, { crewId: fixture.crewId, userId: single });
    await tx.query(
      `WITH made AS (
         INSERT INTO crews (name, created_by) SELECT 'Busy ' || n, $1 FROM generate_series(1, 30) AS n
         RETURNING id),
       members AS (
         INSERT INTO crew_members (crew_id, user_id, role, status, keep_in_chat)
         SELECT id, $1, 'organiser', 'active', false FROM made)
       INSERT INTO trips (crew_id, status) SELECT id, 'voting' FROM made`,
      [busy],
    );
    return dest;
  });
  for (const [name, shape] of Object.entries(SHAPES)) {
    callers.set(name as ShapeName, await seedCaller(db.pool, shape));
  }
  replayBeforeHistory = await startParameterReplay(db.pool);
  // The fixture trip's history: a chain of superseded crew versions ending at its current one,
  // each with a day, a stop, a leg, a plan check issue and the change set that replaced it.
  await withSystem(db.pool, async (tx) => {
    await tx.query(
      `WITH RECURSIVE chain AS (
         SELECT 1 AS n, uuidv7() AS id
         UNION ALL SELECT n + 1, uuidv7() FROM chain WHERE n < $2),
       versions AS (
         INSERT INTO itinerary_versions (id, trip_id, visibility, status, parent_id)
         SELECT c.id, $1, 'crew', 'superseded', p.id FROM chain c LEFT JOIN chain p ON p.n = c.n - 1
         RETURNING id),
       days AS (
         INSERT INTO plan_days (version_id, trip_id, day_no) SELECT id, $1, 1 FROM versions
         RETURNING id, version_id),
       items AS (
         INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, category)
         SELECT version_id, id, $1, uuidv7(), 'sightseeing' FROM days RETURNING version_id, day_id, stable_id),
       legs AS (
         INSERT INTO plan_legs (trip_id, version_id, day_id, from_key, to_key, mode, minutes, meters, source, approx)
         SELECT $1, version_id, day_id, 'stay', stable_id::text, 'walk', 5, 400, 'straight_line', true FROM items),
       issues AS (
         INSERT INTO plan_check_issues (trip_id, version_id, kind, severity, day_id, stable_ids, params, rank, fingerprint)
         SELECT $1, version_id, 'pace', 'know', day_id, ARRAY[stable_id], '{}', 0, 'pace:1' FROM items)
       INSERT INTO change_sets (trip_id, base_version_id, trigger, scope, author_kind, author_id, status, ops)
       SELECT $1, id, 'manual', 'group', 'user', $3, 'draft', '[]' FROM versions`,
      [fixture.tripId, SUPERSEDED, fixture.actors.member],
    );
  });
  replay = await startParameterReplay(db.pool);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('sync connection cost', { timeout: 120_000 }, () => {
  it.each(['founder', 'heavy'] as const)(
    'a %s-shaped phone stays within its budget',
    async (name) => {
      const caller = callers.get(name)!;
      const cost = await replay.cost(caller.userId, heldByDesign(caller));
      expect(cost.results).toBeLessThanOrEqual(Math.max(TODAY[name].results, BUDGET[name].results));
      expect(cost.buckets).toBeLessThanOrEqual(Math.max(TODAY[name].buckets, BUDGET[name].buckets));
    },
  );

  it('a held trip costs a caller in many crews what it costs a caller in one', async () => {
    const trip = TRIP_STREAMS.map((stream) => ({
      stream,
      parameters: { trip_id: harness.fixture.tripId },
    }));
    const extra = async (userId: string) =>
      (await replay.cost(userId, trip)).results - (await replay.cost(userId, [])).results;
    expect(await extra(busy)).toBe(await extra(single));
  });

  it("a trip's lookups grow with its edit history only by the change sets", async () => {
    const trip = TRIP_STREAMS.map((stream) => ({
      stream,
      parameters: { trip_id: harness.fixture.tripId },
    }));
    const before = await replayBeforeHistory.cost(single, trip);
    const after = await replay.cost(single, trip);
    expect(after.results - before.results).toBe(HISTORY_GROWTH);
  });

  it('sends no crowd forecasts: phones read them over HTTP, per place', async () => {
    const member = await harness.rows('trip_pack', 'member', { trip_id: harness.fixture.tripId });
    expect(member.get('crowd_forecasts')).toBeUndefined();
  });
});
