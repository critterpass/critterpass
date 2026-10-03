/**
 * `route_cache` on the real schema: planning travel reads through it so a pair Valhalla answered
 * once is never routed again for 30 days; rows past 30 days, or anything not from Valhalla, are
 * never served; and a cache that can't be reached costs a router call, not the answer.
 */
import { runMigrations, withSystem } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { createPlanningTravel, createValhallaClient, routeCacheKey } from '@cp/suppliers';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { poolRouteCache } from '../../src/routing/route-cache';
import { replayValhalla } from '../../../../packages/suppliers/src/valhalla/fixtures/replay';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;

const dragonBridge = { lat: 16.0611, lng: 108.2272 };
const hanMarket = { lat: 16.0682, lng: 108.2242 };
const myKhe = { lat: 16.0544, lng: 108.247 };
const marble = { lat: 16.0039, lng: 108.2633 };

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 4 });
  await runMigrations(pool);
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

function travelWith(cachePool: pg.Pool) {
  const recorded = replayValhalla('danang-matrix-walk');
  const errors: unknown[] = [];
  const travel = createPlanningTravel({
    valhalla: createValhallaClient({ baseUrl: 'http://valhalla.test:8002', fetch: recorded.fetch }),
    cache: poolRouteCache(cachePool),
    onError: (error) => errors.push(error),
  });
  return { travel, calls: recorded.calls, errors };
}

const day = () =>
  [
    [dragonBridge, hanMarket],
    [myKhe, marble, hanMarket],
  ] as const;

describe('route cache', () => {
  it('routes a day once, then serves it from the cache', async () => {
    const first = travelWith(pool);
    const routed = await first.travel.matrix(...day(), 'walk');
    expect(first.calls).toEqual(['/sources_to_targets']);

    const { rows } = await withSystem(pool, (tx) =>
      tx.query<{ n: number }>("SELECT count(*)::int AS n FROM route_cache WHERE key LIKE 'walk:%'"),
    );
    expect(rows[0]?.n).toBe(6);

    const second = travelWith(pool);
    expect(await second.travel.matrix(...day(), 'walk')).toEqual(routed);
    expect(second.calls).toEqual([]);
  });

  it('never serves a row past 30 days or one that is not from Valhalla', async () => {
    const cache = poolRouteCache(pool);
    const old = routeCacheKey(myKhe, dragonBridge, 'drive');
    const estimate = routeCacheKey(marble, dragonBridge, 'drive');
    const fresh = routeCacheKey(hanMarket, dragonBridge, 'drive');
    await withSystem(pool, (tx) =>
      tx.query(
        `INSERT INTO route_cache (key, minutes, meters, source, computed_at) VALUES
           ($1, 9, 4000, 'valhalla', now() - interval '31 days'),
           ($2, 12, 6000, 'straight_line', now()),
           ($3, 4, 1500, 'valhalla', now() - interval '29 days')`,
        [old, estimate, fresh],
      ),
    );
    const hits = await cache.get([old, estimate, fresh]);
    expect([...hits.keys()]).toEqual([fresh]);
    expect(hits.get(fresh)).toEqual({ minutes: 4, meters: 1500 });

    await cache.put([{ key: old, minutes: 10, meters: 4100 }]);
    expect((await cache.get([old])).get(old)).toEqual({ minutes: 10, meters: 4100 });
  });

  it('answers through the router when the cache is unreachable', async () => {
    const closed = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 1 });
    await closed.end();
    const { travel, calls, errors } = travelWith(closed);
    const cells = await travel.matrix(...day(), 'walk');
    expect(cells[0]?.[0]).toMatchObject({ source: 'valhalla', approx: false });
    expect(calls).toEqual(['/sources_to_targets']);
    expect(errors.length).toBeGreaterThan(0);
  });
});
