import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import {
  anonymousActor,
  insertCrewMember,
  insertTripParticipant,
  insertUser,
  setCrewMemberStatus,
} from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: TripFixture;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildTripFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

interface ParticipantRow {
  readonly user_id: string;
  readonly role: string;
  readonly rsvp: string;
  readonly holds_seat: boolean;
}

async function selectRoster(uid: string): Promise<readonly ParticipantRow[]> {
  return withUser(db.pool, uid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<ParticipantRow>(
      'SELECT user_id, role, rsvp, holds_seat FROM trip_participants WHERE trip_id = $1',
      [fixture.tripId],
    );
    return rows;
  });
}

describe('trip_participants RLS: read', () => {
  it('is invisible to an outsider', async () => {
    expect(await selectRoster(fixture.outsiderId)).toHaveLength(0);
  });

  it('shows the full roster to any crew member', async () => {
    expect(await selectRoster(fixture.memberId)).toHaveLength(2);
    expect(await selectRoster(fixture.organiserId)).toHaveLength(2);
  });

  it('defaults an unopened rsvp to holding a seat', async () => {
    const rows = await selectRoster(fixture.organiserId);
    const memberRow = rows.find((r) => r.user_id === fixture.memberId);
    expect(memberRow).toMatchObject({ rsvp: 'unopened', holds_seat: true });
  });
});

describe('trip_participants RLS: write', () => {
  it('lets a participant change their own rsvp', async () => {
    await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      await tx.query(
        "UPDATE trip_participants SET rsvp = 'in' WHERE trip_id = $1 AND user_id = $2",
        [fixture.tripId, fixture.memberId],
      );
    });
    const rows = await selectRoster(fixture.organiserId);
    expect(rows.find((r) => r.user_id === fixture.memberId)).toMatchObject({ rsvp: 'in' });
  });

  it("does not let a participant change someone else's rsvp", async () => {
    await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      await tx.query(
        "UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = $2",
        [fixture.tripId, fixture.organiserId],
      );
    });
    const rows = await selectRoster(fixture.organiserId);
    expect(rows.find((r) => r.user_id === fixture.organiserId)).toMatchObject({ rsvp: 'unopened' });
  });

  it('lets the organiser change any participant row', async () => {
    await withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
      await tx.query(
        "UPDATE trip_participants SET rsvp = 'maybe' WHERE trip_id = $1 AND user_id = $2",
        [fixture.tripId, fixture.memberId],
      );
    });
    const rows = await selectRoster(fixture.organiserId);
    expect(rows.find((r) => r.user_id === fixture.memberId)).toMatchObject({ rsvp: 'maybe' });
  });

  it('lets a crew member without a row join the roster for themselves', async () => {
    const joiner = await withSystem(db.pool, async (tx) => {
      const userId = await insertUser(tx);
      await insertCrewMember(tx, { crewId: fixture.crewId, userId, role: 'member' });
      return userId;
    });
    await withUser(db.pool, joiner, anonymousActor().device, async (tx) => {
      await tx.query(
        "INSERT INTO trip_participants (trip_id, user_id, role) VALUES ($1, $2, 'member')",
        [fixture.tripId, joiner],
      );
    });
    const rows = await selectRoster(fixture.organiserId);
    expect(rows.some((r) => r.user_id === joiner)).toBe(true);
  });

  it("rejects someone outside the trip's crew adding themselves to the roster", async () => {
    const former = await withSystem(db.pool, async (tx) => {
      const userId = await insertUser(tx);
      await insertCrewMember(tx, { crewId: fixture.crewId, userId, role: 'member' });
      await setCrewMemberStatus(tx, { crewId: fixture.crewId, userId, status: 'removed' });
      return userId;
    });
    for (const uid of [fixture.outsiderId, former]) {
      await expect(
        withUser(db.pool, uid, anonymousActor().device, async (tx) => {
          await tx.query(
            "INSERT INTO trip_participants (trip_id, user_id, role) VALUES ($1, $2, 'member')",
            [fixture.tripId, uid],
          );
        }),
      ).rejects.toThrow(/row-level security/i);
    }
    const rows = await selectRoster(fixture.organiserId);
    expect(rows.some((r) => r.user_id === fixture.outsiderId || r.user_id === former)).toBe(false);
  });

  it('rejects inserting a roster row for someone else', async () => {
    const bystander = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withUser(db.pool, fixture.outsiderId, anonymousActor().device, async (tx) => {
        await tx.query(
          "INSERT INTO trip_participants (trip_id, user_id, role) VALUES ($1, $2, 'member')",
          [fixture.tripId, bystander],
        );
      }),
    ).rejects.toThrow();
  });
});

describe('trip_seats_held', () => {
  async function seatsHeld(pool: pg.Pool, uid: string, tripId: string): Promise<number> {
    return withUser(pool, uid, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ held: number }>('SELECT app.trip_seats_held($1) AS held', [
        tripId,
      ]);
      return rows[0]?.held ?? 0;
    });
  }

  it('counts every participant not out or waitlisted, and frees a seat on out', async () => {
    const isolated = await container.createDatabase();
    try {
      const fx = await buildTripFixture(isolated.pool);
      const extra = await withSystem(isolated.pool, (tx) => insertUser(tx));
      await withSystem(isolated.pool, (tx) =>
        insertTripParticipant(tx, { tripId: fx.tripId, userId: extra, rsvp: 'waitlisted' }),
      );

      const before = await seatsHeld(isolated.pool, fx.organiserId, fx.tripId);
      expect(before).toBe(2); // organiser + member, both default to 'unopened' (holds a seat)

      await withUser(isolated.pool, fx.memberId, anonymousActor().device, async (tx) => {
        await tx.query(
          "UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = $2",
          [fx.tripId, fx.memberId],
        );
      });

      expect(await seatsHeld(isolated.pool, fx.organiserId, fx.tripId)).toBe(before - 1);
    } finally {
      await isolated.drop();
    }
  });

  it('returns 0 to an outsider instead of leaking the headcount', async () => {
    expect(await seatsHeld(db.pool, fixture.outsiderId, fixture.tripId)).toBe(0);
  });
});
