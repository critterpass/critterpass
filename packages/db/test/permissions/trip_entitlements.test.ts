import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import {
  anonymousActor,
  insertCrew,
  insertCrewMember,
  insertTrip,
  insertTripParticipant,
  insertUser,
} from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let tripId: string;
let member: string;
let outsider: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  const organiser = await insertUser(db.pool);
  member = await insertUser(db.pool);
  outsider = await insertUser(db.pool);
  const crewId = await insertCrew(db.pool, { createdBy: organiser });
  await insertCrewMember(db.pool, { crewId, userId: organiser, role: 'organiser' });
  await insertCrewMember(db.pool, { crewId, userId: member, role: 'member' });
  tripId = await insertTrip(db.pool, { crewId });
  await insertTripParticipant(db.pool, { tripId, userId: organiser, role: 'organiser' });
  await insertTripParticipant(db.pool, { tripId, userId: member, role: 'member' });

  await withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO trip_entitlements (trip_id, boost_active, seat_cap, redraft_limit, live_map, sponsored)
       VALUES ($1, true, 16, 2147483647, true, false)`,
      [tripId],
    ),
  );
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('trip_entitlements RLS: trip-member read (class C1, materialised server-side)', () => {
  it('lets a trip member read the row', async () => {
    const rows = await withUser(db.pool, member, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ boost_active: boolean; seat_cap: number }>(
        'SELECT boost_active, seat_cap FROM trip_entitlements WHERE trip_id = $1',
        [tripId],
      );
      return rows;
    });
    expect(rows).toEqual([{ boost_active: true, seat_cap: 16 }]);
  });

  it('never lets an outsider read it', async () => {
    const rows = await withUser(db.pool, outsider, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ '?column?': number }>(
        'SELECT 1 FROM trip_entitlements WHERE trip_id = $1',
        [tripId],
      );
      return rows;
    });
    expect(rows).toEqual([]);
  });

  it('rejects any app_user write, including a trip member updating their own trip', async () => {
    await expect(
      withUser(db.pool, member, anonymousActor().device, (tx) =>
        tx.query('UPDATE trip_entitlements SET boost_active = false WHERE trip_id = $1', [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets app_system materialise a row (the recompute path)', async () => {
    const freshTripId = await withSystem(db.pool, async (tx) => {
      const crewId = await insertCrew(tx, { createdBy: member });
      return insertTrip(tx, { crewId });
    });
    await withSystem(db.pool, (tx) =>
      tx.query('INSERT INTO trip_entitlements (trip_id) VALUES ($1)', [freshTripId]),
    );
    const { rows } = await db.pool.query<{ seat_cap: number }>(
      'SELECT seat_cap FROM trip_entitlements WHERE trip_id = $1',
      [freshTripId],
    );
    expect(rows[0]?.seat_cap).toBe(6);
  });
});
