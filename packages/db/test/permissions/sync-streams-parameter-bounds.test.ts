/**
 * PowerSync evaluates every subquery of a stream query as a parameter query, and one connection
 * may hold at most 1,000 parameter results across all its subscriptions: past that the whole sync
 * request fails (PSYNC_S2305) and nothing syncs. So no subquery may grow with the catalogue or with
 * other crews' data. This suite seeds more than 1,000 candidate rows for every subquery that once
 * filtered by a catalogue-wide key (other trips' plan versions, group guide threads and boosted
 * entitlements; one destination's POIs and their crowd forecasts), then runs each subquery of
 * every stream on its own, as PowerSync does, for each actor and the fixture trip's subscription.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import {
  startStreamHarness,
  STREAM_ACTORS,
  streamQueries,
  type StreamHarness,
} from '../helpers/stream-harness';

const CANDIDATES = 1_100;
/** Well under the service's limit of 1,000 for one connection with a few trips subscribed. */
const PER_SUBQUERY_BOUND = 20;
const CONNECTION_LIMIT = 1_000;

interface ParameterQuery {
  readonly stream: string;
  readonly text: string;
  readonly values: readonly (string | null)[];
}

/** Each `IN (SELECT ...)` of `text` (nested ones too), with its placeholders renumbered from $1. */
function subqueries(text: string, values: readonly (string | null)[]): ParameterQuery[] {
  const found: ParameterQuery[] = [];
  for (const match of text.matchAll(/\bIN\s*\(\s*SELECT\b/gi)) {
    const open = text.indexOf('(', match.index);
    let depth = 0;
    let end = open;
    for (; end < text.length; end += 1) {
      if (text[end] === '(') depth += 1;
      else if (text[end] === ')' && (depth -= 1) === 0) break;
    }
    const body = text.slice(open + 1, end);
    const used: number[] = [];
    const renumbered = body.replace(/\$(\d+)/g, (_match, n: string) => {
      const position = Number(n);
      if (!used.includes(position)) used.push(position);
      return `$${used.indexOf(position) + 1}`;
    });
    found.push({
      stream: '',
      text: renumbered,
      values: used.map((position) => values[position - 1] ?? null),
    });
  }
  return found;
}

function parameterQueries(
  harness: StreamHarness,
  userId: string,
  tripId: string,
): ParameterQuery[] {
  const context = { userId, parameters: { trip_id: tripId } };
  return Object.keys(harness.config.streams).flatMap((stream) =>
    streamQueries(harness.config, stream).flatMap((query) =>
      subqueries(query.text, query.values(context)).map((sub) => ({ ...sub, stream })),
    ),
  );
}

let harness: StreamHarness;
let destinationId: string;

async function count(pool: pg.Pool, sql: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(sql);
  return Number(rows[0]!.n);
}

beforeAll(async () => {
  harness = await startStreamHarness();
  const { fixture } = harness;
  destinationId = await withSystem(harness.db.pool, async (tx) => {
    const outsider = fixture.actors.outsider;
    const crew = await tx.query<{ id: string }>(
      "INSERT INTO crews (name, created_by) VALUES ('Elsewhere', $1) RETURNING id",
      [outsider],
    );
    const crewId = crew.rows[0]!.id;
    // Other crews' trips, each with a crew and an organiser plan version, a group guide thread
    // and a boost: the rows the catalogue-wide subqueries used to return.
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
      [crewId, CANDIDATES, outsider],
    );
    // The fixture trip's destination, with more POIs than one connection may hold results for,
    // each with a crowd forecast.
    const destination = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('bounds-city', 'Bounds City') RETURNING id",
    );
    const dest = destination.rows[0]!.id;
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
    return dest;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('sync stream parameter queries stay bounded', { timeout: 120_000 }, () => {
  it('seeds more catalogue-wide candidates than one connection may hold', async () => {
    const pool = harness.db.pool;
    expect(
      await count(pool, "SELECT count(*) AS n FROM itinerary_versions WHERE visibility = 'crew'"),
    ).toBeGreaterThan(CONNECTION_LIMIT);
    expect(
      await count(pool, "SELECT count(*) AS n FROM guide_threads WHERE mode = 'group'"),
    ).toBeGreaterThan(CONNECTION_LIMIT);
    expect(
      await count(pool, 'SELECT count(*) AS n FROM trip_entitlements WHERE boost_active'),
    ).toBeGreaterThan(CONNECTION_LIMIT);
    expect(
      await count(pool, `SELECT count(*) AS n FROM pois WHERE destination_id = '${destinationId}'`),
    ).toBeGreaterThan(CONNECTION_LIMIT);
  });

  it.each(STREAM_ACTORS)('no subquery of any stream grows with other data (%s)', async (actor) => {
    const userId = harness.fixture.actors[actor];
    const queries = parameterQueries(harness, userId, harness.fixture.tripId);
    expect(queries.length).toBeGreaterThan(0);
    let total = 0;
    const oversized: string[] = [];
    for (const query of queries) {
      const { rowCount } = await harness.db.pool.query(query.text, [...query.values]);
      const results = rowCount ?? 0;
      total += results;
      if (results > PER_SUBQUERY_BOUND)
        oversized.push(`${query.stream}: ${results} ← ${query.text}`);
    }
    expect(oversized).toEqual([]);
    expect(total).toBeLessThan(CONNECTION_LIMIT);
  });

  it("syncs a destination's crowd forecasts by the destination the trigger copies", async () => {
    const rows = await harness.rows('trip_pack', 'member', { trip_id: harness.fixture.tripId });
    const forecasts = rows.get('crowd_forecasts') ?? [];
    expect(forecasts).toHaveLength(CANDIDATES);
    expect(new Set(forecasts.map((row) => row['destination_id']))).toEqual(
      new Set([destinationId]),
    );
    const outsider = await harness.rows('trip_pack', 'outsider', {
      trip_id: harness.fixture.tripId,
    });
    expect(outsider.get('crowd_forecasts') ?? []).toEqual([]);
  });
});
