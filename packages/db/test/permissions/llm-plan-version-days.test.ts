/**
 * `llm.plan_version_days`: the guide sees the current crew plan's version and days, empty days
 * included, for members of the trip in context only; never an organiser's unsent draft.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem } from '../../src/tx';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: TripFixture;
let versionId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildTripFixture(db.pool);
  versionId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
      [fixture.tripId],
    );
    const id = rows[0]?.id as string;
    await tx.query(
      "INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, '2026-10-02'), ($1, $2, 2, '2026-10-03')",
      [id, fixture.tripId],
    );
    await tx.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [fixture.tripId, id]);
    return id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const days = (uid: string, tripId: string) =>
  withGuideReader(db.pool, uid, tripId, async (tx) => {
    const { rows } = await tx.query<{ version_id: string; day_no: number; date: string }>(
      "SELECT version_id, day_no, to_char(date, 'YYYY-MM-DD') AS date FROM llm.plan_version_days ORDER BY day_no",
    );
    return rows;
  });

describe('llm.plan_version_days', () => {
  it('gives a member the current plan with its empty days', async () => {
    expect(await days(fixture.memberId, fixture.tripId)).toEqual([
      { version_id: versionId, day_no: 1, date: '2026-10-02' },
      { version_id: versionId, day_no: 2, date: '2026-10-03' },
    ]);
  });

  it('gives someone outside the trip nothing', async () => {
    expect(await days(fixture.outsiderId, fixture.tripId)).toEqual([]);
  });

  it("never shows an organiser's unsent draft as the plan", async () => {
    await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'organiser', 'draft') RETURNING id",
        [fixture.tripId],
      );
      await tx.query(
        'UPDATE trips SET current_version_id = NULL, draft_version_id = $2 WHERE id = $1',
        [fixture.tripId, rows[0]?.id],
      );
    });
    expect(await days(fixture.organiserId, fixture.tripId)).toEqual([]);
  });
});
