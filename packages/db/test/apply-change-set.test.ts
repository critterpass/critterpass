/**
 * `app.apply_change_set` (packages/db/migrations/*_plan_versions_and_changesets.sql): copies the
 * base version's days/items into a new 'current' version, replaying ops by stable_id, or marks the
 * change set 'stale' with no writes when the trip has moved on to a different current version.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../src/tx';
import { anonymousActor } from './helpers/actors';
import { insertChangeSet } from './helpers/plan-actors';
import { buildPlanFixture, type PlanFixture } from './helpers/plan-fixture';
import { startDbTestContainer, type DbTestContainer, type DbTestDatabase } from './helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function approve(fx: PlanFixture, changeSetId: string): Promise<void> {
  await withUser(db.pool, fx.organiserId, anonymousActor().device, async (tx) => {
    await tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [changeSetId]);
    await tx.query("UPDATE change_sets SET status = 'approved' WHERE id = $1", [changeSetId]);
  });
}

async function apply(fx: PlanFixture, changeSetId: string): Promise<string | null> {
  return withUser(db.pool, fx.organiserId, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<{ apply_change_set: string | null }>(
      'SELECT app.apply_change_set($1)',
      [changeSetId],
    );
    return rows[0]?.apply_change_set ?? null;
  });
}

describe('app.apply_change_set', () => {
  it('rejects applying a change set that is not approved', async () => {
    const fx = await buildPlanFixture(db.pool);
    const changeSetId = await insertChangeSet(db.pool, {
      tripId: fx.tripId,
      baseVersionId: fx.versionId,
      authorId: fx.memberId,
      ops: [
        {
          op: 'retime',
          target: fx.items[0].stableId,
          after: { starts_at: '2027-02-01T09:00:00+07:00' },
          reason: 'x',
          affected_user_ids: [],
          booking_impact: false,
        },
      ],
    });
    await expect(apply(fx, changeSetId)).rejects.toThrow(/not approved/i);
  });

  it('applies retime/remove/add, preserving stable_ids and producing a new current version', async () => {
    const fx = await buildPlanFixture(db.pool);
    const newStableId = generateUuidV7();
    const changeSetId = await insertChangeSet(db.pool, {
      tripId: fx.tripId,
      baseVersionId: fx.versionId,
      authorId: fx.memberId,
      ops: [
        {
          op: 'retime',
          target: fx.items[0].stableId,
          after: { starts_at: '2027-02-01T09:00:00+07:00' },
          reason: 'weather',
          affected_user_ids: [],
          booking_impact: false,
        },
        {
          op: 'remove',
          target: fx.items[1].stableId,
          reason: 'dropped',
          affected_user_ids: [],
          booking_impact: false,
        },
        {
          op: 'add',
          target: newStableId,
          after: { day_no: 1, category: 'sunset-cruise', starts_at: '2027-02-01T18:00:00+07:00' },
          reason: 'added instead',
          affected_user_ids: [],
          booking_impact: true,
        },
      ],
    });
    await approve(fx, changeSetId);

    const newVersionId = await apply(fx, changeSetId);
    expect(newVersionId).not.toBeNull();
    expect(newVersionId).not.toBe(fx.versionId);

    // A pg client serves one query at a time, so these run sequentially on the same connection.
    const outcome = await withSystem(db.pool, async (tx) => {
      const trip = await tx.query<{ current_version_id: string }>(
        'SELECT current_version_id FROM trips WHERE id = $1',
        [fx.tripId],
      );
      const oldVersion = await tx.query<{ status: string }>(
        'SELECT status FROM itinerary_versions WHERE id = $1',
        [fx.versionId],
      );
      const newVersion = await tx.query<{ status: string }>(
        'SELECT status FROM itinerary_versions WHERE id = $1',
        [newVersionId],
      );
      const changeSet = await tx.query<{ status: string; result_version_id: string }>(
        'SELECT status, result_version_id FROM change_sets WHERE id = $1',
        [changeSetId],
      );
      const items = await tx.query<{ stable_id: string; category: string; starts_at: Date }>(
        'SELECT stable_id, category, starts_at FROM plan_items WHERE version_id = $1 ORDER BY category',
        [newVersionId],
      );
      return {
        trip: trip.rows[0],
        oldVersion: oldVersion.rows[0],
        newVersion: newVersion.rows[0],
        changeSet: changeSet.rows[0],
        items: items.rows,
      };
    });

    expect(outcome.trip).toMatchObject({ current_version_id: newVersionId });
    expect(outcome.oldVersion).toMatchObject({ status: 'superseded' });
    expect(outcome.newVersion).toMatchObject({ status: 'current' });
    expect(outcome.changeSet).toMatchObject({ status: 'applied', result_version_id: newVersionId });

    expect(outcome.items).toHaveLength(2);
    const stableIds = outcome.items.map((i) => i.stable_id).sort();
    expect(stableIds).toEqual([fx.items[0].stableId, newStableId].sort());
    const retimed = outcome.items.find((i) => i.stable_id === fx.items[0].stableId);
    expect(retimed?.starts_at.toISOString()).toBe(new Date('2027-02-01T09:00:00+07:00').toISOString());
    const added = outcome.items.find((i) => i.stable_id === newStableId);
    expect(added).toMatchObject({ category: 'sunset-cruise' });
  });

  it('marks a change set stale and writes nothing when the base version is no longer current', async () => {
    const fx = await buildPlanFixture(db.pool);
    const firstChangeSetId = await insertChangeSet(db.pool, {
      tripId: fx.tripId,
      baseVersionId: fx.versionId,
      authorId: fx.memberId,
      ops: [
        {
          op: 'retime',
          target: fx.items[0].stableId,
          after: { starts_at: '2027-02-01T09:00:00+07:00' },
          reason: 'x',
          affected_user_ids: [],
          booking_impact: false,
        },
      ],
    });
    const staleChangeSetId = await insertChangeSet(db.pool, {
      tripId: fx.tripId,
      baseVersionId: fx.versionId,
      authorId: fx.memberId,
      ops: [
        {
          op: 'retime',
          target: fx.items[1].stableId,
          after: { starts_at: '2027-02-02T09:00:00+07:00' },
          reason: 'y',
          affected_user_ids: [],
          booking_impact: false,
        },
      ],
    });
    await approve(fx, firstChangeSetId);
    await approve(fx, staleChangeSetId);

    const firstResult = await apply(fx, firstChangeSetId);
    expect(firstResult).not.toBeNull();

    const versionCountBefore = await withSystem(db.pool, (tx) =>
      tx.query<{ count: string }>('SELECT count(*)::text FROM itinerary_versions WHERE trip_id = $1', [
        fx.tripId,
      ]),
    );

    const staleResult = await apply(fx, staleChangeSetId);
    expect(staleResult).toBeNull();

    const { rows: staleRows } = await withSystem(db.pool, (tx) =>
      tx.query<{ status: string; result_version_id: string | null }>(
        'SELECT status, result_version_id FROM change_sets WHERE id = $1',
        [staleChangeSetId],
      ),
    );
    expect(staleRows[0]).toMatchObject({ status: 'stale', result_version_id: null });

    const versionCountAfter = await withSystem(db.pool, (tx) =>
      tx.query<{ count: string }>('SELECT count(*)::text FROM itinerary_versions WHERE trip_id = $1', [
        fx.tripId,
      ]),
    );
    expect(versionCountAfter.rows[0]?.count).toBe(versionCountBefore.rows[0]?.count);

    const tripAfter = await withSystem(db.pool, (tx) =>
      tx.query<{ current_version_id: string }>('SELECT current_version_id FROM trips WHERE id = $1', [
        fx.tripId,
      ]),
    );
    expect(tripAfter.rows[0]).toMatchObject({ current_version_id: firstResult });
  });
});
