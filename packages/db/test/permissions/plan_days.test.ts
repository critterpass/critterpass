import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import { insertItineraryVersion, insertPlanDay } from '../helpers/plan-actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildPlanFixture, type PlanFixture } from '../helpers/plan-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PlanFixture;
let draftVersionId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPlanFixture(db.pool);
  await withSystem(db.pool, async (tx) => {
    draftVersionId = await insertItineraryVersion(tx, {
      tripId: fixture.tripId,
      visibility: 'organiser',
      status: 'draft',
    });
    await insertPlanDay(tx, { versionId: draftVersionId, tripId: fixture.tripId, dayNo: 1 });
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function selectDays(uid: string, versionId: string): Promise<readonly { id: string }[]> {
  return withUser(db.pool, uid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'SELECT id FROM plan_days WHERE version_id = $1',
      [versionId],
    );
    return rows;
  });
}

describe("plan_days RLS: follows the version's visibility", () => {
  it('is invisible to an outsider', async () => {
    expect(await selectDays(fixture.outsiderId, fixture.versionId)).toHaveLength(0);
  });

  it('shows crew-visible days to a plain member', async () => {
    expect(await selectDays(fixture.memberId, fixture.versionId)).toHaveLength(2);
  });

  it("hides an organiser-only draft's days from a plain member", async () => {
    expect(await selectDays(fixture.memberId, draftVersionId)).toHaveLength(0);
    expect(await selectDays(fixture.organiserId, draftVersionId)).toHaveLength(1);
  });

  it('lets the organiser add a day to their own draft', async () => {
    await withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
      await tx.query('INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 2)', [
        draftVersionId,
        fixture.tripId,
      ]);
    });
    expect(await selectDays(fixture.organiserId, draftVersionId)).toHaveLength(2);
  });

  it('does not let a plain member insert a day', async () => {
    await expect(
      withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
        await tx.query('INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 3)', [
          fixture.versionId,
          fixture.tripId,
        ]);
      }),
    ).rejects.toThrow();
  });

  it('enforces one row per (version_id, day_no)', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query('INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 1)', [
          draftVersionId,
          fixture.tripId,
        ]),
      ),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('lets only the server delete a replaced draft and its days, never the organiser', async () => {
    const replaced = await withSystem(db.pool, async (tx) => {
      const id = await insertItineraryVersion(tx, {
        tripId: fixture.tripId,
        visibility: 'organiser',
        status: 'superseded',
      });
      await insertPlanDay(tx, { versionId: id, tripId: fixture.tripId, dayNo: 1 });
      return id;
    });
    for (const sql of [
      'DELETE FROM plan_days WHERE version_id = $1',
      'DELETE FROM itinerary_versions WHERE id = $1',
    ]) {
      await expect(
        withUser(db.pool, fixture.organiserId, anonymousActor().device, (tx) =>
          tx.query(sql, [replaced]),
        ),
      ).rejects.toThrow(/permission denied/);
    }
    await withSystem(db.pool, async (tx) => {
      await tx.query('DELETE FROM plan_days WHERE version_id = $1', [replaced]);
      await tx.query('DELETE FROM itinerary_versions WHERE id = $1', [replaced]);
    });
    const { rows } = await db.pool.query('SELECT 1 FROM itinerary_versions WHERE id = $1', [
      replaced,
    ]);
    expect(rows).toHaveLength(0);
  });
});
