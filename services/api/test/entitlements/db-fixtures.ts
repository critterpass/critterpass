/**
 * Minimal real-row fixtures shared by materialise.db.test.ts/entitle.db.test.ts. `@cp/db` only
 * exports `withUser`/`withSystem`/`runMigrations` publicly (its own `test/helpers/*` are internal to
 * that package), so these small inserts are hand-written here rather than imported across the
 * package boundary.
 */
import { withSystem } from '@cp/db';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export function randomId(): string {
  return randomUUID();
}

export async function insertUser(pool: pg.Pool): Promise<string> {
  const id = randomId();
  await withSystem(pool, (tx) =>
    tx.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [id]),
  );
  return id;
}

export interface CrewTripFixture {
  readonly crewId: string;
  readonly tripId: string;
  readonly memberUids: readonly string[];
}

/** One crew of `memberCount` users, one voting-stage trip, every member seated as a participant. */
export async function insertCrewWithTrip(pool: pg.Pool, memberCount = 3): Promise<CrewTripFixture> {
  const memberUids = await Promise.all(Array.from({ length: memberCount }, () => insertUser(pool)));

  return withSystem(pool, async (tx) => {
    const firstMember = memberUids[0];
    if (firstMember === undefined) throw new Error('insertCrewWithTrip: memberCount must be >= 1');

    const { rows: crewRows } = await tx.query<{ id: string }>(
      'INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id',
      ['Test crew', firstMember],
    );
    const crewId = crewRows[0]?.id;
    if (crewId === undefined) throw new Error('insertCrewWithTrip: crew insert returned no id');

    for (const [index, uid] of memberUids.entries()) {
      await tx.query('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
        crewId,
        uid,
        index === 0 ? 'organiser' : 'member',
      ]);
    }

    const { rows: tripRows } = await tx.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [crewId],
    );
    const tripId = tripRows[0]?.id;
    if (tripId === undefined) throw new Error('insertCrewWithTrip: trip insert returned no id');

    for (const [index, uid] of memberUids.entries()) {
      await tx.query(
        "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
        [tripId, uid, index === 0 ? 'organiser' : 'member'],
      );
    }

    return { crewId, tripId, memberUids };
  });
}
