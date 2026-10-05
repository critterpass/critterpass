import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let uid: string;
let poiId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  uid = await insertUser(db.pool);
  poiId = await withSystem(db.pool, async (tx) => {
    const dest = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, country) VALUES ('profile-town', 'Profile Town', 'VN') RETURNING id",
    );
    const poi = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, status)
       VALUES ($1, 'Old Palace', 'museum', 11.9, 108.4, 'active') RETURNING id`,
      [firstRow(dest.rows).id],
    );
    return firstRow(poi.rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const device = () => anonymousActor().device;

describe('place_profiles RLS: readable by every signed-in reader, written by the worker (class R)', () => {
  it('lets app_system write a profile and app_user read it', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO place_profiles (poi_id, status, texts, best_times, visit_min, facts)
         VALUES ($1, 'ready', '{"en": {"why_go": "A palace.", "best_time": "", "crowd": "", "facts": []}}',
                 '{morning}', 75, '[]')`,
        [poiId],
      ),
    );
    const { rows } = await withUser(db.pool, uid, device(), (tx) =>
      tx.query<{ status: string; visit_min: number }>(
        'SELECT status, visit_min FROM place_profiles WHERE poi_id = $1',
        [poiId],
      ),
    );
    expect(rows).toEqual([{ status: 'ready', visit_min: 75 }]);
  });

  it('refuses every app_user write', async () => {
    await expect(
      withUser(db.pool, uid, device(), (tx) =>
        tx.query("UPDATE place_profiles SET status = 'failed' WHERE poi_id = $1", [poiId]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, uid, device(), (tx) =>
        tx.query('INSERT INTO place_profiles (poi_id) VALUES ($1)', [poiId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects labels outside the closed sets', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query("UPDATE place_profiles SET best_times = '{brunch}' WHERE poi_id = $1", [poiId]),
      ),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query("UPDATE place_profiles SET meal_role = 'feast' WHERE poi_id = $1", [poiId]),
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it('never enters the powersync publication', async () => {
    const { rows } = await db.pool.query(
      `SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync'
         AND tablename IN ('place_profiles', 'place_search_pace')`,
    );
    expect(rows).toEqual([]);
  });
});

function reserve(gapMs: number): Promise<{ wait_ms: number; seq: string }> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ wait_ms: number; seq: string }>(
      'SELECT wait_ms, seq FROM app.reserve_place_search($1)',
      [gapMs],
    );
    return firstRow(rows);
  });
}

describe('app.reserve_place_search: one shared pace for every worker', () => {
  it('keeps the pace and its counter from app_user', async () => {
    await expect(
      withUser(db.pool, uid, device(), (tx) => tx.query('SELECT app.reserve_place_search(1000)')),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, uid, device(), (tx) => tx.query('SELECT 1 FROM place_search_pace')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('spaces concurrent reservations by the gap and numbers them', async () => {
    const slots = await Promise.all(Array.from({ length: 5 }, () => reserve(10_000)));
    const waits = slots.map((s) => s.wait_ms).sort((a, b) => a - b);
    // Five callers at once: the first goes now, each later one 10 s after the one before.
    expect(waits[0]).toBeLessThan(1_000);
    for (let i = 1; i < waits.length; i += 1) {
      expect((waits[i] ?? 0) - (waits[i - 1] ?? 0)).toBeGreaterThan(9_000);
      expect((waits[i] ?? 0) - (waits[i - 1] ?? 0)).toBeLessThan(11_000);
    }
    expect(new Set(slots.map((s) => s.seq)).size).toBe(5);
  });
});
