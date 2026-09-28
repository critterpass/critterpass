/**
 * `meetups` (C1, RLS T behind the crew-map gate): participants of a boosted trip in its trip days
 * read and set the meet-up; an unboosted trip's participants, crew members who are not on the trip,
 * outsiders and anonymous uids see nothing and write nothing. Arrival marks are system-only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { anonymousActor, insertCrewMember, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';
import { boostTrip, moveTripIntoTripDays } from './live-map-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let boosted: TripFixture;
let firstTripFree: TripFixture;
let unboosted: TripFixture;
let bystanderId: string;
const device = anonymousActor().device;

function asUser<T>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return withUser(db.pool, uid, device, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

function insertMeetup(uid: string, tripId: string): Promise<{ id: string }[]> {
  return asUser<{ id: string }>(
    uid,
    `INSERT INTO meetups (trip_id, place_name, lat, lng, meet_at, created_by)
     VALUES ($1, 'Campuhan Ridge', -8.5031, 115.2544, now() + interval '1 hour', $2) RETURNING id`,
    [tripId, uid],
  );
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  boosted = await buildTripFixture(db.pool);
  firstTripFree = await buildTripFixture(db.pool);
  unboosted = await buildTripFixture(db.pool);
  for (const fx of [boosted, firstTripFree, unboosted]) {
    await moveTripIntoTripDays(db.pool, fx.tripId, { tz: 'Asia/Makassar', daysLeft: 3 });
  }
  await boostTrip(db.pool, boosted.tripId, true);
  // First Trip Free materialises into the same boost snapshot.
  await boostTrip(db.pool, firstTripFree.tripId, true);
  await boostTrip(db.pool, unboosted.tripId, false);
  bystanderId = await withSystem(db.pool, async (tx) => {
    const uid = await insertUser(tx);
    await insertCrewMember(tx, { crewId: boosted.crewId, userId: uid, role: 'member' });
    return uid;
  });
}, 240_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('meetups RLS', () => {
  let meetupId: string;

  it('lets a participant of a boosted trip set a meet-up the crew then reads', async () => {
    const rows = await insertMeetup(boosted.memberId, boosted.tripId);
    meetupId = rows[0]!.id;
    const seen = await asUser<{ place_name: string }>(
      boosted.organiserId,
      'SELECT place_name FROM meetups WHERE id = $1',
      [meetupId],
    );
    expect(seen).toEqual([{ place_name: 'Campuhan Ridge' }]);
  });

  it('works the same on a First Trip Free trip', async () => {
    const rows = await insertMeetup(firstTripFree.organiserId, firstTripFree.tripId);
    expect(rows).toHaveLength(1);
  });

  it('lets a participant move it, but never mark arrivals', async () => {
    await asUser(
      boosted.organiserId,
      "UPDATE meetups SET meet_at = now() + interval '2 hours' WHERE id = $1",
      [meetupId],
    );
    await expect(
      asUser(boosted.organiserId, `UPDATE meetups SET arrived = '{}'::jsonb WHERE id = $1`, [
        meetupId,
      ]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(boosted.organiserId, 'DELETE FROM meetups WHERE id = $1', [meetupId]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps one active meet-up per trip', async () => {
    await expect(insertMeetup(boosted.organiserId, boosted.tripId)).rejects.toThrow(
      /meetups_one_active_per_trip_idx/,
    );
  });

  it('gives an unboosted trip nothing to read or write', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO meetups (trip_id, place_name, lat, lng, meet_at, created_by)
         VALUES ($1, 'Warung', -8.5, 115.26, now(), $2)`,
        [unboosted.tripId, unboosted.organiserId],
      ),
    );
    expect(await asUser(unboosted.memberId, 'SELECT 1 FROM meetups')).toEqual([]);
    await expect(insertMeetup(unboosted.memberId, unboosted.tripId)).rejects.toThrow(
      /row-level security/i,
    );
  });

  it('hides it from a crew member off the trip, an outsider and an anonymous uid', async () => {
    for (const uid of [bystanderId, boosted.outsiderId, anonymousActor().uid]) {
      expect(
        await asUser(uid, 'SELECT 1 FROM meetups WHERE trip_id = $1', [boosted.tripId]),
      ).toEqual([]);
    }
    await expect(insertMeetup(bystanderId, boosted.tripId)).rejects.toThrow(/row-level security/i);
    await expect(insertMeetup(boosted.outsiderId, boosted.tripId)).rejects.toThrow(
      /row-level security/i,
    );
  });

  it('refuses a meet-up created in someone else’s name', async () => {
    await expect(
      asUser(
        boosted.memberId,
        `INSERT INTO meetups (trip_id, place_name, lat, lng, meet_at, created_by)
         VALUES ($1, 'X', 0, 0, now(), $2)`,
        [firstTripFree.tripId, firstTripFree.organiserId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('gives guide_reader nothing and is in the publication', async () => {
    await expect(
      withGuideReader(db.pool, boosted.memberId, boosted.tripId, (tx) =>
        tx.query('SELECT 1 FROM meetups'),
      ),
    ).rejects.toThrow(/permission denied/i);
    const { rows } = await db.pool.query<{ published: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync'
                        AND tablename = 'meetups') AS published`,
    );
    expect(rows[0]?.published).toBe(true);
  });
});
