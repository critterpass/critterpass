import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import {
  anonymousActor,
  insertCrew,
  insertCrewMember,
  insertTrip,
  insertTripParticipant,
  insertUser,
} from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let tripId: string;
let member: string;
let outsider: string;
let owner: string;
let other: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  const organiser = await insertUser(db.pool);
  member = await insertUser(db.pool);
  outsider = await insertUser(db.pool);
  owner = await insertUser(db.pool);
  other = await insertUser(db.pool);
  const crewId = await insertCrew(db.pool, { createdBy: organiser });
  await insertCrewMember(db.pool, { crewId, userId: organiser, role: 'organiser' });
  await insertCrewMember(db.pool, { crewId, userId: member, role: 'member' });
  tripId = await insertTrip(db.pool, { crewId });
  await insertTripParticipant(db.pool, { tripId, userId: organiser, role: 'organiser' });
  await insertTripParticipant(db.pool, { tripId, userId: member, role: 'member' });

  // Seeded as app_owner directly (the raw pool connection bypasses RLS): usage_counters has no
  // app_system write grant at all by design (only app.consume_quota/app.release_quota may write it,
  // proven below), so withSystem cannot be used here.
  await db.pool.query(
    `INSERT INTO usage_counters (subject_kind, subject_id, metric, period_key, count, limit_at_time, reset_at)
     VALUES ('trip', $1, 'redrafts', '2026-06-15', 1, 3, now() + interval '1 day')`,
    [tripId],
  );
  await db.pool.query(
    `INSERT INTO usage_counters (subject_kind, subject_id, metric, period_key, count, limit_at_time, reset_at)
     VALUES ('user', $1, 'guide_answers', '2026-06-15', 5, 30, now() + interval '1 day')`,
    [owner],
  );
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('usage_counters RLS: "O / T" by subject_kind (class C2)', () => {
  it('lets a trip member read a trip-scoped row; an outsider sees nothing', async () => {
    const memberRows = await withUser(db.pool, member, anonymousActor().device, (tx) =>
      tx.query('SELECT count FROM usage_counters WHERE subject_kind = $1 AND subject_id = $2', [
        'trip',
        tripId,
      ]),
    );
    expect(memberRows.rows).toEqual([{ count: 1 }]);

    const outsiderRows = await withUser(db.pool, outsider, anonymousActor().device, (tx) =>
      tx.query('SELECT 1 FROM usage_counters WHERE subject_kind = $1 AND subject_id = $2', [
        'trip',
        tripId,
      ]),
    );
    expect(outsiderRows.rows).toEqual([]);
  });

  it('lets the subject user read their own user-scoped row; another user sees nothing', async () => {
    const ownRows = await withUser(db.pool, owner, anonymousActor().device, (tx) =>
      tx.query('SELECT count FROM usage_counters WHERE subject_kind = $1 AND subject_id = $2', [
        'user',
        owner,
      ]),
    );
    expect(ownRows.rows).toEqual([{ count: 5 }]);

    const otherRows = await withUser(db.pool, other, anonymousActor().device, (tx) =>
      tx.query('SELECT 1 FROM usage_counters WHERE subject_kind = $1 AND subject_id = $2', [
        'user',
        owner,
      ]),
    );
    expect(otherRows.rows).toEqual([]);
  });

  it('a trip member never sees another user-scoped row just by being a trip member', async () => {
    const rows = await withUser(db.pool, member, anonymousActor().device, (tx) =>
      tx.query('SELECT 1 FROM usage_counters WHERE subject_kind = $1 AND subject_id = $2', [
        'user',
        owner,
      ]),
    );
    expect(rows.rows).toEqual([]);
  });

  it('rejects a direct app_user write outright: every write goes through app.consume_quota/app.release_quota', async () => {
    await expect(
      withUser(db.pool, owner, anonymousActor().device, (tx) =>
        tx.query(
          `INSERT INTO usage_counters (subject_kind, subject_id, metric, period_key, limit_at_time, reset_at)
           VALUES ('user', $1, 'map_opens', '2026-06-16', 10, now())`,
          [owner],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects a direct app_system write too (no grant, only the SECURITY DEFINER functions)', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO usage_counters (subject_kind, subject_id, metric, period_key, limit_at_time, reset_at)
           VALUES ('user', $1, 'map_opens', '2026-06-16', 10, now())`,
          [owner],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects a metric outside the closed set, even via the owning function', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query('SELECT app.consume_quota($1, $2, $3, $4, $5, $6)', [
          'user',
          owner,
          'not_a_real_metric',
          '2026-06-17',
          30,
          new Date(),
        ]),
      ),
    ).rejects.toThrow();
  });
});
