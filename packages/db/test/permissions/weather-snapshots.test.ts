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
let destinationId: string;

const actor = anonymousActor();
const BODY = JSON.stringify({ day: {}, hours: [] });

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  const { rows } = await withSystem(db.pool, (tx) =>
    tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('weather-dest', 'Weather Dest') RETURNING id",
    ),
  );
  destinationId = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

function insertSnapshot(pointKey: string, date: string, hourly: string = BODY) {
  return withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO weather_snapshots (destination_id, point_key, lat, lng, date, hourly, source, fetched_at, checked_at)
       VALUES ($1, $2, -8.5, 115.26, $3, $4, 'weatherapi', now(), now())`,
      [destinationId, pointKey, date, hourly],
    ),
  );
}

describe('weather_snapshots RLS: catalogue (class C0, read-all, system-written)', () => {
  it('is readable by any authenticated app_user', async () => {
    await insertSnapshot('centroid', '2026-09-28');
    const count = await withUser(db.pool, actor.uid, actor.device, async (tx) => {
      const { rows } = await tx.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM weather_snapshots WHERE destination_id = $1',
        [destinationId],
      );
      return rows[0]!.n;
    });
    expect(count).toBe(1);
  });

  it('rejects an app_user write outright', async () => {
    await expect(
      withUser(db.pool, actor.uid, actor.device, (tx) =>
        tx.query("UPDATE weather_snapshots SET point_key = 'x'"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps one row per (destination, point, date, source) and separate rows per point', async () => {
    await expect(insertSnapshot('centroid', '2026-09-28')).rejects.toThrow(/duplicate key/i);
    await insertSnapshot('summit:mount-batur', '2026-09-28');
  });

  it('rejects an unknown source and a non-object body', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO weather_snapshots (destination_id, point_key, lat, lng, date, hourly, source, fetched_at, checked_at)
           VALUES ($1, 'centroid', 0, 0, '2026-09-29', $2, 'open-meteo', now(), now())`,
          [destinationId, BODY],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
    await expect(insertSnapshot('centroid', '2026-09-30', '[]')).rejects.toThrow(
      /check constraint/i,
    );
  });
});
