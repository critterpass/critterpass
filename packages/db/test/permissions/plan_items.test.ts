import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildPlanFixture, type PlanFixture } from '../helpers/plan-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PlanFixture;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPlanFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function selectItems(uid: string): Promise<readonly { id: string; category: string }[]> {
  return withUser(db.pool, uid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<{ id: string; category: string }>(
      'SELECT id, category FROM plan_items WHERE version_id = $1',
      [fixture.versionId],
    );
    return rows;
  });
}

describe('plan_items RLS', () => {
  it('is invisible to an outsider', async () => {
    expect(await selectItems(fixture.outsiderId)).toHaveLength(0);
  });

  it('is readable by any crew member (the current version is crew-visible)', async () => {
    expect(await selectItems(fixture.memberId)).toHaveLength(2);
    expect(await selectItems(fixture.organiserId)).toHaveLength(2);
  });

  it('denies a member INSERT — guides and members never write plan_items directly', async () => {
    await expect(
      withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
        await tx.query(
          'INSERT INTO plan_items (version_id, day_id, trip_id, category) VALUES ($1, $2, $3, $4)',
          [fixture.versionId, fixture.dayIds[0], fixture.tripId, 'snuck-in'],
        );
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('denies the organiser INSERT too — the only write path is app.apply_change_set', async () => {
    await expect(
      withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
        await tx.query(
          'INSERT INTO plan_items (version_id, day_id, trip_id, category) VALUES ($1, $2, $3, $4)',
          [fixture.versionId, fixture.dayIds[0], fixture.tripId, 'snuck-in'],
        );
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('denies UPDATE from any app_user, including the organiser', async () => {
    await expect(
      withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
        await tx.query('UPDATE plan_items SET notes = $1 WHERE id = $2', ['hijacked', fixture.items[0].id]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });
});
