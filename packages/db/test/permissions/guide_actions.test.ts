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
let guideActionId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildTripFixture(db.pool);
  guideActionId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO guide_actions (trip_id, kind, status) VALUES ($1, 'book_activity', 'planned') RETURNING id",
      [fixture.tripId],
    );
    return firstRow(rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('guide_actions RLS: T read, S write', () => {
  it('is invisible to an outsider', async () => {
    const rows = await withUser(db.pool, fixture.outsiderId, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ id: string }>('SELECT id FROM guide_actions WHERE trip_id = $1', [
        fixture.tripId,
      ]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('is readable by any crew member', async () => {
    const rows = await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ id: string }>('SELECT id FROM guide_actions WHERE trip_id = $1', [
        fixture.tripId,
      ]);
      return rows;
    });
    expect(rows).toEqual([{ id: guideActionId }]);
  });

  it('denies a write from any app_user, including the organiser', async () => {
    await expect(
      withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
        await tx.query("UPDATE guide_actions SET status = 'done' WHERE id = $1", [guideActionId]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('is writable by app_system', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query("UPDATE guide_actions SET status = 'done' WHERE id = $1", [guideActionId]),
    );
    const rows = await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ status: string }>('SELECT status FROM guide_actions WHERE id = $1', [
        guideActionId,
      ]);
      return rows;
    });
    expect(rows[0]).toMatchObject({ status: 'done' });
  });
});
