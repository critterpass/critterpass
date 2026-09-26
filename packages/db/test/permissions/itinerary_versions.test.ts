import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import { insertItineraryVersion } from '../helpers/plan-actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildPlanFixture, type PlanFixture } from '../helpers/plan-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PlanFixture;
let organiserDraftId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPlanFixture(db.pool);
  organiserDraftId = await insertItineraryVersion(db.pool, {
    tripId: fixture.tripId,
    visibility: 'organiser',
    status: 'draft',
    parentId: fixture.versionId,
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function selectVersions(uid: string): Promise<readonly { id: string }[]> {
  return withUser(db.pool, uid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<{ id: string }>('SELECT id FROM itinerary_versions WHERE trip_id = $1', [
      fixture.tripId,
    ]);
    return rows;
  });
}

describe('itinerary_versions RLS', () => {
  it('is invisible to an outsider', async () => {
    expect(await selectVersions(fixture.outsiderId)).toHaveLength(0);
  });

  it('shows the crew-visible current version to a plain member', async () => {
    const rows = await selectVersions(fixture.memberId);
    expect(rows.map((r) => r.id)).toEqual([fixture.versionId]);
  });

  it('shows both versions to the organiser, including the private draft', async () => {
    const rows = await selectVersions(fixture.organiserId);
    expect(rows.map((r) => r.id).sort()).toEqual([fixture.versionId, organiserDraftId].sort());
  });

  it('does not let a member SELECT an organiser-only draft even by id', async () => {
    const rows = await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ id: string }>('SELECT id FROM itinerary_versions WHERE id = $1', [
        organiserDraftId,
      ]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('lets the organiser create a new draft version', async () => {
    await withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
      await tx.query(
        "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'organiser', 'drafting')",
        [fixture.tripId],
      );
    });
    const rows = await selectVersions(fixture.organiserId);
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('does not let a plain member create a version', async () => {
    await expect(
      withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
        await tx.query(
          "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'drafting')",
          [fixture.tripId],
        );
      }),
    ).rejects.toThrow();
  });
});
