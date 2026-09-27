/**
 * `season.ingest` over a migrated Postgres: months with fresh fares from three origins take a
 * fare-derived price index; months without that coverage keep the editorial one; reruns change
 * nothing; the job works on Mondays and inside blossom/foliage windows only.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  isSeasonIngestDay,
  recomputeSeasonPriceIndexes,
} from '../../src/travel-data/season-ingest';
import { startNotifyDb, type NotifyDb } from '../notify-fixtures';
import { insertLiveDestinations } from './travel-fixtures';

let db: NotifyDb;
let kyoto: string;
const NOW = new Date('2026-09-28T03:00:00Z');

async function cell(origin: string, month: string, price: number, ageHours = 2) {
  await db.pool.query(
    `INSERT INTO fare_cells (origin_iata, dest_iata, destination_id, month, price_minor, currency,
       fetched_at, checked_at)
     VALUES ($1, 'KIX', $2, $3, $4, 'USD', $5, $5)`,
    [origin, kyoto, `${month}-01`, price, new Date(NOW.getTime() - ageHours * 3_600_000)],
  );
}

beforeAll(async () => {
  db = await startNotifyDb();
  kyoto = (await insertLiveDestinations(db.pool))['kyoto'] ?? '';
  for (let month = 1; month <= 12; month += 1) {
    await db.pool.query(
      `INSERT INTO season_months (destination_id, month, crowd_index, price_index, colour_role,
         source, sourced_on, reviewed_at)
       VALUES ($1, $2, 50, 40, 'normal', 'JNTO', '2026-09-28', now())`,
      [kyoto, month],
    );
  }
  for (const [origin, nov, apr] of [
    ['SIN', 40_000, 80_000],
    ['KUL', 42_000, 90_000],
    ['BKK', 45_000, 85_000],
  ] as const) {
    await cell(origin, '2026-11', nov);
    await cell(origin, '2027-04', apr);
  }
  // January: only two origins, and one stale fare that must not count.
  await cell('SIN', '2027-01', 30_000);
  await cell('KUL', '2027-01', 31_000);
  await cell('BKK', '2027-01', 1_000, 100);
}, 240_000);

afterAll(async () => {
  await db.stop();
});

async function months() {
  const { rows } = await db.pool.query<{ month: number; price_index: number; source: string }>(
    `SELECT month, price_index, price_index_source AS source FROM season_months
      WHERE destination_id = $1 AND month IN (1, 4, 11) ORDER BY month`,
    [kyoto],
  );
  return rows;
}

describe('recomputeSeasonPriceIndexes', () => {
  it('replaces the index of covered months only, and is idempotent', async () => {
    const first = await withSystem(db.pool, (tx) => recomputeSeasonPriceIndexes(tx, NOW));
    expect(first.monthsUpdated).toBe(2);
    expect(await months()).toEqual([
      { month: 1, price_index: 40, source: 'editorial' },
      { month: 4, price_index: 100, source: 'fares' },
      { month: 11, price_index: 0, source: 'fares' },
    ]);
    const again = await withSystem(db.pool, (tx) => recomputeSeasonPriceIndexes(tx, NOW));
    expect(again.monthsUpdated).toBe(0);
  });
});

describe('isSeasonIngestDay', () => {
  it('runs on Mondays (SGT) and inside a reviewed blossom window, not otherwise', async () => {
    const sundayNight = new Date('2026-09-27T12:00:00Z'); // Sunday 20:00 SGT
    const mondayMorning = new Date('2026-09-27T20:00:00Z'); // Monday 04:00 SGT
    await withSystem(db.pool, async (tx) => {
      expect(await isSeasonIngestDay(tx, sundayNight)).toBe(false);
      expect(await isSeasonIngestDay(tx, mondayMorning)).toBe(true);
    });
    await db.pool.query(
      `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, source,
         sourced_on, reviewed_at)
       VALUES ($1, 'autumn-leaves', 'foliage', 'Autumn leaves', '2026-10-20', '2026-12-05', 'JNTO',
         '2026-09-28', now())`,
      [kyoto],
    );
    await withSystem(db.pool, async (tx) => {
      expect(await isSeasonIngestDay(tx, sundayNight)).toBe(true);
    });
  });
});
