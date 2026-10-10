/**
 * The crew chat's "all square" line: granting the Settled Tokek for a trip posts one `trip_settled`
 * system row in the trip's crew chat (how many people it settled in the body), once per trip, and
 * other stickers post nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../src/tx';
import { buildPermissionFixture, type PermissionFixture } from './helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from './helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

function grant(users: readonly string[], kind = 'settled') {
  return withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO stickers (user_id, crew_id, trip_id, kind, granted_at)
       SELECT u, $2, $3, $4, now() FROM unnest($1::uuid[]) AS u
       ON CONFLICT DO NOTHING`,
      [users, fixture.crewId, fixture.tripId, kind],
    ),
  );
}

function lines() {
  return withSystem(db.pool, (tx) =>
    tx.query<{ ref_id: string; body: string }>(
      `SELECT ref_id, body FROM messages
        WHERE crew_id = $1 AND type = 'system' AND ref_kind = 'trip_settled'`,
      [fixture.crewId],
    ),
  );
}

describe('trip settled line', () => {
  it('posts nothing for another sticker kind', async () => {
    await grant([fixture.actors.member], 'crew_level');
    expect((await lines()).rows).toEqual([]);
  });

  it('posts one line when the trip settles, and never a second', async () => {
    const { organiser, coOrganiser, member } = fixture.actors;
    await grant([organiser, coOrganiser, member]);
    expect((await lines()).rows).toEqual([{ ref_id: fixture.tripId, body: '3' }]);
    await grant([organiser]);
    expect((await lines()).rows).toHaveLength(1);
  });
});
