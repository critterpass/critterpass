import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let poiId: string;

const actor = anonymousActor();
const DAY = Array.from({ length: 24 }, (_, hour) => (hour < 7 ? 5 : 60));

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  poiId = await withSystem(db.pool, async (tx) => {
    const destination = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('crowd-dest', 'Crowd Dest') RETURNING id",
    );
    const poi = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Fushimi Inari Taisha', 'temple_shrine', 34.9671, 135.7727) RETURNING id`,
      [destination.rows[0]!.id],
    );
    return poi.rows[0]!.id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

function insertForecast(dow: number, hourly: readonly number[]) {
  return withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at)
       VALUES ($1, $2, $3, 'besttime', now())`,
      [poiId, dow, hourly],
    ),
  );
}

describe('crowd_forecasts RLS: catalogue (class C0, read-all, system-written)', () => {
  it('is readable by any authenticated app_user', async () => {
    await insertForecast(0, DAY);
    const hourly = await withUser(db.pool, actor.uid, actor.device, async (tx) => {
      const { rows } = await tx.query<{ hourly: number[] }>(
        'SELECT hourly FROM crowd_forecasts WHERE poi_id = $1 AND dow = 0',
        [poiId],
      );
      return rows[0]?.hourly;
    });
    expect(hourly).toEqual(DAY);
  });

  it('rejects an app_user write outright', async () => {
    await expect(
      withUser(db.pool, actor.uid, actor.device, (tx) =>
        tx.query('UPDATE crowd_forecasts SET dow = 1'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('requires 24 values between 0 and 100 and a valid day of week', async () => {
    await expect(insertForecast(1, DAY.slice(1))).rejects.toThrow(/check constraint/i);
    await expect(insertForecast(1, [...DAY.slice(1), 101])).rejects.toThrow(/check constraint/i);
    await expect(insertForecast(7, DAY)).rejects.toThrow(/check constraint/i);
  });

  it('keeps one pattern per place and day of week', async () => {
    await expect(insertForecast(0, DAY)).rejects.toThrow(/duplicate key/i);
  });
});
