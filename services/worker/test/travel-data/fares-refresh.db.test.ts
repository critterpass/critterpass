/**
 * `fares.refresh` over a migrated Postgres and recorded Travelpayouts answers: cells are written
 * from real responses, an empty month stores "no price" (null, never zero), a same-night rerun asks
 * nothing and writes nothing, and a nightly drop tells the crews flying from that origin.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  applyFareMonth,
  FARE_RECHECK_HOURS,
  refreshFares,
  selectFareTargets,
} from '../../src/travel-data/fares-refresh';
import { withSystem } from '@cp/db';
import {
  insertCrew,
  insertTripUnderWay,
  insertUser,
  silentLogger,
  startNotifyDb,
  type NotifyDb,
} from '../notify-fixtures';
import { insertLiveDestinations, recordedFares } from './travel-fixtures';

let db: NotifyDb;
let destinations: Record<string, string>;
let crewId: string;
const NOW = new Date('2026-09-28T03:00:00Z');
const RECORDED = new Set(['SIN-DPS-2026-11', 'SIN-KIX-2027-04', 'HAN-CUZ-2027-02']);
const only = (t: { origin: string; destIata: string; month: string }) =>
  RECORDED.has(`${t.origin}-${t.destIata}-${t.month}`);

beforeAll(async () => {
  db = await startNotifyDb();
  destinations = await insertLiveDestinations(db.pool);
  const singapore = await insertUser(db.pool);
  const hanoi = await insertUser(db.pool);
  await db.pool.query("UPDATE users SET home_airport = 'sin' WHERE id = $1", [singapore]);
  await db.pool.query("UPDATE users SET home_airport = 'HAN' WHERE id = $1", [hanoi]);
  crewId = await insertCrew(db.pool, [singapore, hanoi]);
  await insertTripUnderWay(db.pool, crewId, 'Asia/Makassar', [singapore, hanoi]);
  await db.pool.query(
    `INSERT INTO cities (name, country, lat, lng, population, iata_nearby)
     VALUES ('Hanoi', 'VN', 21.0285, 105.8542, 8000000, '{HAN}')`,
  );
  // The SIN → DPS cell was dearer over the last few nights.
  await db.pool.query(
    `INSERT INTO fare_cells (origin_iata, dest_iata, destination_id, month, price_minor, currency,
       price_history, fetched_at, checked_at)
     VALUES ('SIN', 'DPS', $1, '2026-11-01', 17000, 'USD', $2, $3, $3)`,
    [
      destinations['bali'],
      JSON.stringify([
        { on: '2026-09-25', price_minor: 17_500 },
        { on: '2026-09-27', price_minor: 17_000 },
      ]),
      new Date(NOW.getTime() - (FARE_RECHECK_HOURS + 4) * 3_600_000),
    ],
  );
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function fareEvents() {
  const { rows } = await db.pool.query<{ crew_id: string; payload: Record<string, unknown> }>(
    "SELECT crew_id, payload FROM domain_events WHERE type = 'fare.dropped'",
  );
  return rows;
}

describe('selectFareTargets', () => {
  it('prices every live destination airport for crew home airports, their nearest hub and 12 months', async () => {
    const targets = await withSystem(db.pool, (tx) => selectFareTargets(tx, NOW));
    const origins = [...new Set(targets.map((t) => t.origin))].sort();
    expect(origins).toEqual(['HAN', 'HKG', 'SIN']);
    const months = [...new Set(targets.map((t) => t.month))];
    expect(months[0]).toBe('2026-09');
    expect(months).toHaveLength(12);
    expect(new Set(targets.map((t) => t.destIata))).toEqual(
      new Set(['DPS', 'KIX', 'KEF', 'MEX', 'LIS', 'CUZ', 'DAD']),
    );
    expect(targets).toHaveLength(3 * 7 * 12);
  });
});

describe('refreshFares', () => {
  it('writes cells from the recorded answers and announces the SIN → DPS drop once', async () => {
    const fares = recordedFares();
    const report = await refreshFares({
      pool: db.pool,
      fetchMonth: fares.fetchMonth,
      logger: silentLogger,
      now: NOW,
      only,
    });
    expect(report).toMatchObject({
      targets: 3,
      skipped: 0,
      priced: 2,
      empty: 1,
      failed: 0,
      drops: 1,
    });

    const { rows } = await db.pool.query(
      `SELECT origin_iata, dest_iata, to_char(month, 'YYYY-MM') AS month, price_minor::int, currency,
              depart_on::text, return_on::text, transfers, duration_min, fastest_duration_min,
              jsonb_array_length(days) AS days, price_history, found_at IS NOT NULL AS has_found
         FROM fare_cells ORDER BY origin_iata, dest_iata`,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        origin_iata: 'HAN',
        dest_iata: 'CUZ',
        price_minor: null,
        days: 0,
      }),
      expect.objectContaining({
        origin_iata: 'SIN',
        dest_iata: 'DPS',
        month: '2026-11',
        price_minor: 13_900,
        currency: 'USD',
        depart_on: '2026-11-11',
        return_on: '2026-11-19',
        transfers: 0,
        duration_min: 175,
        fastest_duration_min: 165,
        has_found: true,
        price_history: [
          { on: '2026-09-25', price_minor: 17_500 },
          { on: '2026-09-27', price_minor: 17_000 },
          { on: '2026-09-28', price_minor: 13_900 },
        ],
      }),
      expect.objectContaining({ origin_iata: 'SIN', dest_iata: 'KIX', price_minor: 33_600 }),
    ]);

    expect(await fareEvents()).toEqual([
      {
        crew_id: crewId,
        payload: {
          crew_id: crewId,
          destination_id: destinations['bali'],
          month: '2026-11',
          origin: 'SIN',
          price_minor: 13_900,
          previous_min_minor: 17_000,
          currency: 'USD',
          delta_pct: 18,
        },
      },
    ]);
  });

  it('is a no-op when rerun the same night: no supplier calls, no writes, no new events', async () => {
    const before = await db.pool.query('SELECT id, updated_at FROM fare_cells ORDER BY id');
    const fares = recordedFares();
    const report = await refreshFares({
      pool: db.pool,
      fetchMonth: fares.fetchMonth,
      logger: silentLogger,
      now: new Date(NOW.getTime() + 60 * 60_000),
      only,
    });
    expect(report).toMatchObject({ targets: 3, skipped: 3, priced: 0, empty: 0, drops: 0 });
    expect(fares.urls).toHaveLength(0);
    const after = await db.pool.query('SELECT id, updated_at FROM fare_cells ORDER BY id');
    expect(after.rows).toEqual(before.rows);
    expect(await fareEvents()).toHaveLength(1);
  });

  it('keeps the last price (ageing it) when the next night answers empty', async () => {
    const nextNight = new Date(NOW.getTime() + 24 * 3_600_000);
    await withSystem(db.pool, (tx) =>
      applyFareMonth(
        tx,
        { origin: 'SIN', destIata: 'DPS', destinationId: destinations['bali']!, month: '2026-11' },
        { currency: 'usd', prices: [] },
        nextNight,
      ),
    );
    const { rows } = await db.pool.query<{
      price_minor: number;
      fetched_at: Date;
      checked_at: Date;
    }>(
      `SELECT price_minor::int, fetched_at, checked_at FROM fare_cells
        WHERE origin_iata = 'SIN' AND dest_iata = 'DPS'`,
    );
    expect(rows[0]?.price_minor).toBe(13_900);
    expect(rows[0]?.fetched_at.getTime()).toBe(NOW.getTime());
    expect(rows[0]?.checked_at.getTime()).toBe(nextNight.getTime());
  });
});
