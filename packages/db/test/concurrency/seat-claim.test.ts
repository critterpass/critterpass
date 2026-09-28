/**
 * Seat claims under real concurrency against Postgres. Each joiner runs what `accept_invite` runs,
 * as `app_user` in its own transaction: join the crew under `app.lock_crew_membership`, then take
 * or queue for a seat under `app.lock_trip_seats` with the domain's `allocateSeat`. However many
 * claims race, the trip never holds more than its cap (6, or 16 while boosted), the rest queue at
 * gap-free waitlist positions, and a crew never passes its 16-member ceiling.
 */
import { randomUUID } from 'node:crypto';

import { allocateSeat, decideCrewJoin, type ExistingParticipation } from '@cp/domain';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { insertCrew, insertCrewMember, insertTrip, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let racePool: pg.Pool;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  racePool = new pg.Pool({ ...db.pool.options, max: 40 });
  racePool.on('error', () => undefined);
}, 180_000);

afterAll(async () => {
  await racePool.end();
  await db.drop();
  await container.stop();
});

type Outcome = 'seated' | 'waitlisted' | 'crew_full';

async function claim(uid: string, crewId: string, tripId: string | null): Promise<Outcome> {
  return withUser(racePool, uid, randomUUID(), async (tx) => {
    const { rows: lock } = await tx.query<{ active_members: number; member_ceiling: number }>(
      'SELECT * FROM app.lock_crew_membership($1)',
      [crewId],
    );
    const decision = decideCrewJoin({
      alreadyMember: false,
      activeMembers: lock[0]!.active_members,
      memberCeiling: lock[0]!.member_ceiling,
      joinerActiveCrews: 0,
      maxActiveCrews: 10,
    });
    if (decision.kind !== 'join') return 'crew_full';
    await tx.query('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [crewId, uid]);
    if (tripId === null) return 'seated';

    const { rows } = await tx.query<{
      seats_held: number;
      seat_cap: number;
      open_offers: number;
      last_waitlist_position: number | null;
    }>('SELECT * FROM app.lock_trip_seats($1)', [tripId]);
    const seats = rows[0]!;
    const none: ExistingParticipation = { kind: 'none' };
    const allocation = allocateSeat(
      {
        seatsHeld: seats.seats_held,
        cap: seats.seat_cap,
        openOffers: seats.open_offers,
        lastWaitlistPosition: seats.last_waitlist_position,
      },
      none,
    );
    const seated = allocation.kind === 'seat';
    await tx.query(
      `INSERT INTO trip_participants (trip_id, user_id, rsvp, waitlist_position)
       VALUES ($1, $2, $3, $4)`,
      [
        tripId,
        uid,
        seated ? 'in' : 'waitlisted',
        allocation.kind === 'waitlist' ? allocation.position : null,
      ],
    );
    return seated ? 'seated' : 'waitlisted';
  });
}

interface Scenario {
  readonly crewId: string;
  readonly tripId: string;
  readonly joiners: readonly string[];
}

async function scenario(options: {
  seated: number;
  joiners: number;
  boosted: boolean;
  ceiling: number;
}): Promise<Scenario> {
  return withSystem(db.pool, async (tx) => {
    const owner = await insertUser(tx);
    const crewId = await insertCrew(tx, { createdBy: owner });
    await tx.query('UPDATE crews SET member_ceiling = $2 WHERE id = $1', [crewId, options.ceiling]);
    const tripId = await insertTrip(tx, { crewId });
    if (options.boosted) {
      await tx.query(
        'INSERT INTO trip_entitlements (trip_id, boost_active, seat_cap) VALUES ($1, true, 16)',
        [tripId],
      );
    }
    for (let i = 0; i < options.seated; i += 1) {
      const uid = i === 0 ? owner : await insertUser(tx);
      await insertCrewMember(tx, { crewId, userId: uid, role: i === 0 ? 'organiser' : 'member' });
      await tx.query(
        "INSERT INTO trip_participants (trip_id, user_id, rsvp) VALUES ($1, $2, 'in')",
        [tripId, uid],
      );
    }
    const joiners: string[] = [];
    for (let i = 0; i < options.joiners; i += 1) joiners.push(await insertUser(tx));
    return { crewId, tripId, joiners };
  });
}

async function seats(tripId: string) {
  const { rows } = await db.pool.query<{ held: number; positions: number[] | null }>(
    `SELECT count(*) FILTER (WHERE holds_seat)::int AS held,
            array_agg(waitlist_position ORDER BY waitlist_position)
              FILTER (WHERE rsvp = 'waitlisted') AS positions
       FROM trip_participants WHERE trip_id = $1`,
    [tripId],
  );
  return rows[0]!;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('seat claims under concurrency', { timeout: 120_000 }, () => {
  it('seats exactly the 2 free seats of a 6-seat trip and waitlists the other 48', async () => {
    const s = await scenario({ seated: 4, joiners: 50, boosted: false, ceiling: 100 });
    const outcomes = await Promise.all(s.joiners.map((uid) => claim(uid, s.crewId, s.tripId)));
    expect(outcomes.filter((o) => o === 'seated')).toHaveLength(2);
    expect(outcomes.filter((o) => o === 'waitlisted')).toHaveLength(48);
    const after = await seats(s.tripId);
    expect(after.held).toBe(6);
    expect(after.positions).toEqual(range(48));
  });

  it('seats up to 16 while boosted and queues the rest', async () => {
    const s = await scenario({ seated: 12, joiners: 30, boosted: true, ceiling: 100 });
    const outcomes = await Promise.all(s.joiners.map((uid) => claim(uid, s.crewId, s.tripId)));
    expect(outcomes.filter((o) => o === 'seated')).toHaveLength(4);
    const after = await seats(s.tripId);
    expect(after.held).toBe(16);
    expect(after.positions).toEqual(range(26));
  });

  it('never lets a crew pass its 16-member ceiling', async () => {
    const s = await scenario({ seated: 4, joiners: 20, boosted: false, ceiling: 16 });
    const outcomes = await Promise.all(s.joiners.map((uid) => claim(uid, s.crewId, null)));
    expect(outcomes.filter((o) => o === 'seated')).toHaveLength(12);
    expect(outcomes.filter((o) => o === 'crew_full')).toHaveLength(8);
    const { rows } = await db.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM crew_members WHERE crew_id = $1 AND status = 'active'",
      [s.crewId],
    );
    expect(rows[0]?.n).toBe(16);
  });
});
