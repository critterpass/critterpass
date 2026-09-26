import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: TripFixture;
let activityId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildTripFixture(db.pool);
  activityId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO activity_events (id, trip_id, crew_id, actor_kind, actor_id, verb, object_kind)
       VALUES (uuidv7(), $1, $2, 'user', $3, 'moved', 'trip') RETURNING id`,
      [fixture.tripId, fixture.crewId, fixture.organiserId],
    );
    return firstRow(rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('activity_events RLS: T read, S write', () => {
  it('is invisible to an outsider', async () => {
    const rows = await withUser(db.pool, fixture.outsiderId, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ id: string }>('SELECT id FROM activity_events WHERE trip_id = $1', [
        fixture.tripId,
      ]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('is readable by any crew member', async () => {
    const rows = await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ id: string }>('SELECT id FROM activity_events WHERE trip_id = $1', [
        fixture.tripId,
      ]);
      return rows;
    });
    expect(rows).toEqual([{ id: activityId }]);
  });

  it('denies a write from any app_user, including the organiser', async () => {
    await expect(
      withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
        await tx.query(
          `INSERT INTO activity_events (id, trip_id, crew_id, actor_kind, verb, object_kind)
           VALUES (uuidv7(), $1, $2, 'user', 'snuck-in', 'trip')`,
          [fixture.tripId, fixture.crewId],
        );
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('is writable by app_system (app.append_activity is SECURITY DEFINER and bypasses this anyway)', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO activity_events (id, trip_id, crew_id, actor_kind, verb, object_kind)
         VALUES (uuidv7(), $1, $2, 'system', 'purged', 'trip')`,
        [fixture.tripId, fixture.crewId],
      ),
    );
    const rows = await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ id: string }>('SELECT id FROM activity_events WHERE trip_id = $1', [
        fixture.tripId,
      ]);
      return rows;
    });
    expect(rows.length).toBe(2);
  });
});
