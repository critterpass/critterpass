/**
 * The crew live map gate (`app.crew_map_open`): open only while the trip is boosted (Boost or First
 * Trip Free), in its trip days, and before midnight after the last day in the destination zone.
 * Crew-map ETAs follow it; Help ETAs (no meet-up) do not. No GUC can move its clock, app_user
 * cannot ask about another instant, and a member who leaves or a Boost that ends revokes the
 * `trip_locations` subscription in the same transaction.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import {
  anonymousActor,
  insertCrewMember,
  insertUser,
  setCrewMemberStatus,
} from '../helpers/actors';
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
let unboosted: TripFixture;
let bystanderId: string;
const device = anonymousActor().device;

function asUser<T>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return withUser(db.pool, uid, device, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function gateFor(uid: string, tripId: string): Promise<boolean> {
  const rows = await asUser<{ open: boolean }>(uid, 'SELECT app.crew_map_open($1) AS open', [
    tripId,
  ]);
  return rows[0]?.open === true;
}

async function openAt(tripId: string, at: string): Promise<boolean> {
  const { rows } = await db.pool.query<{ open: boolean }>(
    'SELECT app.crew_map_open_at($1, $2::timestamptz) AS open',
    [tripId, at],
  );
  return rows[0]?.open === true;
}

async function insertEtas(fx: TripFixture): Promise<void> {
  await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO meetups (trip_id, place_name, lat, lng, meet_at, created_by)
       VALUES ($1, 'Campuhan Ridge', -8.5, 115.25, now() + interval '1 hour', $2) RETURNING id`,
      [fx.tripId, fx.organiserId],
    );
    await tx.query(
      `INSERT INTO member_etas (trip_id, meetup_id, user_id, eta_min, sharing)
       VALUES ($1, $2, $3, 7, 'live'), ($1, NULL, $4, 12, 'live')`,
      [fx.tripId, rows[0]!.id, fx.organiserId, fx.memberId],
    );
  });
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  boosted = await buildTripFixture(db.pool);
  unboosted = await buildTripFixture(db.pool);
  for (const fx of [boosted, unboosted]) {
    await moveTripIntoTripDays(db.pool, fx.tripId, { tz: 'Asia/Makassar', daysLeft: 2 });
    await insertEtas(fx);
  }
  await boostTrip(db.pool, boosted.tripId, true);
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

describe('app.crew_map_open', () => {
  it('opens for a boosted trip in its trip days and stays shut without Boost', async () => {
    expect(await gateFor(boosted.memberId, boosted.tripId)).toBe(true);
    expect(await gateFor(unboosted.memberId, unboosted.tripId)).toBe(false);
  });

  it('shuts at midnight after the last day in the destination zone', async () => {
    const { rows } = await db.pool.query<{ end_at: Date }>(
      'SELECT app.crew_map_window_end($1) AS end_at',
      [boosted.tripId],
    );
    const end = rows[0]!.end_at;
    // Asia/Makassar is UTC+8: local midnight is 16:00 UTC the day before.
    expect(end.getUTCHours()).toBe(16);
    expect(await openAt(boosted.tripId, new Date(end.getTime() - 1000).toISOString())).toBe(true);
    expect(await openAt(boosted.tripId, end.toISOString())).toBe(false);
    expect(await openAt(boosted.tripId, new Date(end.getTime() + 60_000).toISOString())).toBe(
      false,
    );
  });

  it('stays shut outside trip days even when boosted', async () => {
    const planning = await buildTripFixture(db.pool);
    await boostTrip(db.pool, planning.tripId, true);
    expect(await gateFor(planning.organiserId, planning.tripId)).toBe(false);
  });

  it('refuses app_user a direct call with another instant', async () => {
    await expect(
      asUser(boosted.memberId, "SELECT app.crew_map_open_at($1, now() - interval '1 day')", [
        boosted.tripId,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('ignores any app.* clock setting', async () => {
    const rows = await withUser(db.pool, unboosted.memberId, device, async (tx) => {
      for (const name of ['app.now', 'app.clock', 'app.test_now']) {
        await tx.query('SELECT set_config($1, $2, true)', [name, '2000-01-01T00:00:00Z']);
      }
      return (
        await tx.query<{ open: boolean }>('SELECT app.crew_map_open($1) AS open', [
          unboosted.tripId,
        ])
      ).rows;
    });
    expect(rows[0]?.open).toBe(false);
    const after = await withUser(db.pool, boosted.memberId, device, async (tx) => {
      await tx.query("SELECT set_config('app.now', '2999-01-01T00:00:00Z', true)");
      return (
        await tx.query<{ open: boolean }>('SELECT app.crew_map_open($1) AS open', [boosted.tripId])
      ).rows;
    });
    expect(after[0]?.open).toBe(true);
  });
});

describe('member_etas with the crew-map gate', () => {
  it('shows crew-map and Help ETAs to a participant of a boosted trip', async () => {
    const rows = await asUser<{ eta_min: number }>(
      boosted.memberId,
      'SELECT eta_min FROM member_etas WHERE trip_id = $1 ORDER BY eta_min',
      [boosted.tripId],
    );
    expect(rows.map((row) => row.eta_min)).toEqual([7, 12]);
  });

  it('hides crew-map ETAs of an unboosted trip, keeping Help ETAs', async () => {
    const rows = await asUser<{ eta_min: number }>(
      unboosted.memberId,
      'SELECT eta_min FROM member_etas WHERE trip_id = $1 AND meetup_id IS NOT NULL',
      [unboosted.tripId],
    );
    expect(rows).toEqual([]);
    const help = await asUser<{ eta_min: number }>(
      unboosted.memberId,
      'SELECT eta_min FROM member_etas WHERE trip_id = $1 AND meetup_id IS NULL',
      [unboosted.tripId],
    );
    expect(help).toEqual([{ eta_min: 12 }]);
  });

  it('hides crew-map ETAs from a crew member who is not a participant, and from outsiders', async () => {
    for (const uid of [bystanderId, boosted.outsiderId, anonymousActor().uid]) {
      expect(
        await asUser(
          uid,
          'SELECT 1 FROM member_etas WHERE trip_id = $1 AND meetup_id IS NOT NULL',
          [boosted.tripId],
        ),
      ).toEqual([]);
    }
  });
});

describe('server-side revocation', () => {
  async function outboxFor(tripId: string, uid: string): Promise<string[]> {
    const { rows } = await db.pool.query<{ kind: string }>(
      `SELECT kind FROM rt_outbox
        WHERE channel = 'trip_locations:' || $1 AND payload->>'user_id' = $2::text`,
      [tripId, uid],
    );
    return rows.map((row) => row.kind);
  }

  it('unsubscribes a participant who answers out and ends their share', async () => {
    const fx = await buildTripFixture(db.pool);
    await moveTripIntoTripDays(db.pool, fx.tripId, { tz: 'Asia/Makassar', daysLeft: 1 });
    await boostTrip(db.pool, fx.tripId, true);
    const shareId = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO location_shares (trip_id, user_id, reason, starts_at, ends_at)
         VALUES ($1, $2, 'crew_map', now() - interval '1 minute', app.crew_map_window_end($1))
         RETURNING id`,
        [fx.tripId, fx.memberId],
      );
      return rows[0]!.id;
    });
    await withSystem(db.pool, (tx) =>
      tx.query("UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = $2", [
        fx.tripId,
        fx.memberId,
      ]),
    );
    expect(await outboxFor(fx.tripId, fx.memberId)).toEqual(['unsubscribe']);
    const { rows } = await db.pool.query<{ open: boolean; ended: number }>(
      `SELECT ends_at <= now() AS open,
              (SELECT count(*)::int FROM rt_outbox WHERE channel = 'trip_locations:' || $2
                 AND payload->>'type' = 'share.ended') AS ended
         FROM location_shares WHERE id = $1`,
      [shareId, fx.tripId],
    );
    expect(rows[0]).toEqual({ open: true, ended: 1 });
  });

  it('unsubscribes a crew member removed while the map is open, and nobody when it is shut', async () => {
    const open = await buildTripFixture(db.pool);
    await moveTripIntoTripDays(db.pool, open.tripId, { tz: 'Asia/Makassar', daysLeft: 1 });
    await boostTrip(db.pool, open.tripId, true);
    await withSystem(db.pool, (tx) =>
      setCrewMemberStatus(tx, { crewId: open.crewId, userId: open.memberId, status: 'removed' }),
    );
    expect(await outboxFor(open.tripId, open.memberId)).toEqual(['unsubscribe']);

    const shut = await buildTripFixture(db.pool);
    await withSystem(db.pool, (tx) =>
      setCrewMemberStatus(tx, { crewId: shut.crewId, userId: shut.memberId, status: 'removed' }),
    );
    expect(await outboxFor(shut.tripId, shut.memberId)).toEqual([]);
  });

  it('unsubscribes every participant and crew member when Boost ends', async () => {
    const fx = await buildTripFixture(db.pool);
    await moveTripIntoTripDays(db.pool, fx.tripId, { tz: 'Pacific/Honolulu', daysLeft: 1 });
    await boostTrip(db.pool, fx.tripId, true);
    await boostTrip(db.pool, fx.tripId, false);
    expect(await outboxFor(fx.tripId, fx.organiserId)).toEqual(['unsubscribe']);
    expect(await outboxFor(fx.tripId, fx.memberId)).toEqual(['unsubscribe']);
    expect(await gateFor(fx.memberId, fx.tripId)).toBe(false);
  });
});
