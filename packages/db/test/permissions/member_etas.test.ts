/**
 * `member_etas` (C1, RLS T, system-written): crew members of the trip read ETAs; nobody writes
 * them but the system; the table never syncs (ETAs travel over Centrifugo).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fx: TripFixture;
const device = anonymousActor().device;

function asUser<T>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return withUser(db.pool, uid, device, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fx = await buildTripFixture(db.pool);
  await withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO member_etas (trip_id, user_id, distance_m, eta_min, mode, progress, sharing)
       VALUES ($1, $2, 850, 11, 'pedestrian', 0.4, 'live')`,
      [fx.tripId, fx.organiserId],
    ),
  );
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('member_etas RLS', () => {
  it('shows ETAs to the crew of the trip', async () => {
    const rows = await asUser<{ eta_min: number }>(fx.memberId, 'SELECT eta_min FROM member_etas');
    expect(rows).toEqual([{ eta_min: 11 }]);
  });

  it('hides them from an outsider and an anonymous uid', async () => {
    expect(await asUser(fx.outsiderId, 'SELECT 1 FROM member_etas')).toEqual([]);
    expect(await asUser(anonymousActor().uid, 'SELECT 1 FROM member_etas')).toEqual([]);
  });

  it('rejects every app_user write', async () => {
    await expect(
      asUser(fx.organiserId, 'UPDATE member_etas SET eta_min = 1 WHERE user_id = $1', [
        fx.organiserId,
      ]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(fx.memberId, 'INSERT INTO member_etas (trip_id, user_id) VALUES ($1, $2)', [
        fx.tripId,
        fx.memberId,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('bounds progress and sharing', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO member_etas (trip_id, user_id, progress, sharing) VALUES ($1, $2, 1.5, 'live')",
          [fx.tripId, fx.memberId],
        ),
      ),
    ).rejects.toThrow(/member_etas_values_check/);
  });

  it('gives guide_reader nothing and stays out of the publication', async () => {
    await expect(
      withGuideReader(db.pool, fx.memberId, fx.tripId, (tx) =>
        tx.query('SELECT 1 FROM member_etas'),
      ),
    ).rejects.toThrow(/permission denied/i);
    const { rows } = await db.pool.query<{ published: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync'
                        AND tablename = 'member_etas') AS published`,
    );
    expect(rows[0]?.published).toBe(false);
  });
});
