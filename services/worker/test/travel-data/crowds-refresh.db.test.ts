/**
 * `crowds.refresh` with no hourly source: patterns older than 90 days are dropped so the app falls
 * back to the month curve; fresh ones stay.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CROWD_PATTERN_MAX_AGE_DAYS,
  expireCrowdPatterns,
} from '../../src/travel-data/crowds-refresh';
import { startNotifyDb, type NotifyDb } from '../notify-fixtures';
import { insertLiveDestinations } from './travel-fixtures';

let db: NotifyDb;
let poiId: string;
const NOW = new Date('2026-09-28T03:00:00Z');
const DAY = 86_400_000;

beforeAll(async () => {
  db = await startNotifyDb();
  const kyoto = (await insertLiveDestinations(db.pool))['kyoto'];
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Fushimi Inari Taisha', 'temple_shrine', 34.9671, 135.7727) RETURNING id`,
    [kyoto],
  );
  poiId = rows[0]?.id ?? '';
}, 240_000);

afterAll(async () => {
  await db.stop();
});

describe('crowd pattern upkeep', () => {
  it('has seven fresh daily patterns to start from', async () => {
    for (let dow = 0; dow < 7; dow += 1) {
      await db.pool.query(
        `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at)
         VALUES ($1, $2, array_fill(10::smallint, ARRAY[24]), 'besttime', $3)`,
        [poiId, dow, NOW],
      );
    }
    const { rows } = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM crowd_forecasts',
    );
    expect(rows[0]?.n).toBe(7);
  });

  it(`drops patterns older than ${CROWD_PATTERN_MAX_AGE_DAYS} days and keeps fresh ones`, async () => {
    await db.pool.query('UPDATE crowd_forecasts SET fetched_at = $1 WHERE dow < 3', [
      new Date(NOW.getTime() - (CROWD_PATTERN_MAX_AGE_DAYS + 1) * DAY),
    ]);
    const expired = await withSystem(db.pool, (tx) => expireCrowdPatterns(tx, NOW));
    expect(expired).toBe(3);
    const again = await withSystem(db.pool, (tx) => expireCrowdPatterns(tx, NOW));
    expect(again).toBe(0);
    const { rows } = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM crowd_forecasts',
    );
    expect(rows[0]?.n).toBe(4);
  });
});
