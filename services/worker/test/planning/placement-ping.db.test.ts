/**
 * The placed-ideas ping, delivered both ways: the push is sent whether or not the app is open, and
 * an inbox row waits for the person who asked (nobody else), opening their review and carrying a
 * count only. The row is settled when that review is applied; nothing is filed when nothing was
 * placed.
 */
import { randomUUID } from 'node:crypto';

import { getNotificationSpec } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fanOutEvent } from '../../src/jobs/inbox/fanout';
import { getRegistration } from '../../src/jobs/notify/register';
import { registerPlacementPush } from '../../src/jobs/planning/ideas/placement-push';
import {
  insertCrew,
  insertEvent,
  insertUser,
  startNotifyDb,
  type NotifyDb,
} from '../notify-fixtures';

let db: NotifyDb;
let linh: string;
let minh: string;
let crewId: string;
let tripId: string;
let versionId: string;

async function placed(ops: number): Promise<{ changeSetId: string; eventId: string }> {
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO change_sets (trip_id, base_version_id, trigger, scope, author_kind, author_id, status, ops)
     VALUES ($1, $2, 'ideas', 'group', 'user', $3, 'draft', $4) RETURNING id`,
    [
      tripId,
      versionId,
      linh,
      JSON.stringify(
        Array.from({ length: ops }, () => ({
          op: 'add',
          target: randomUUID(),
          reason: 'ideas_placed',
          affected_user_ids: [],
          booking_impact: false,
        })),
      ),
    ],
  );
  const changeSetId = rows[0]!.id;
  const eventId = await insertEvent(
    db.pool,
    'ideas.placed',
    { trip_id: tripId, job_id: randomUUID(), user_id: linh, change_set_id: changeSetId },
    { crewId, tripId },
  );
  return { changeSetId, eventId };
}

const rowsFor = async (changeSetId: string) =>
  (
    await db.pool.query<{
      user_id: string;
      data: { change_set_id: string; count: number };
      deep_link: string;
      needs_you: boolean;
      resolved: boolean;
    }>(
      `SELECT user_id, data, deep_link, needs_you, resolved_at IS NOT NULL AS resolved
         FROM inbox_items WHERE kind = 'ideas.placed' AND data->>'change_set_id' = $1`,
      [changeSetId],
    )
  ).rows;

beforeAll(async () => {
  db = await startNotifyDb();
  registerPlacementPush();
  [linh, minh] = [await insertUser(db.pool), await insertUser(db.pool)];
  crewId = await insertCrew(db.pool, [linh, minh]);
  const trip = await db.pool.query<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'setup') RETURNING id",
    [crewId],
  );
  tripId = trip.rows[0]!.id;
  const version = await db.pool.query<{ id: string }>(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  );
  versionId = version.rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('the placed-ideas ping', () => {
  it('is pushed with the app open too, to the person who asked', () => {
    expect(getNotificationSpec('ideas_placed')?.onlyIfBackgrounded).toBe(false);
    expect(getRegistration('ideas.placed', 'ideas_placed')).toBeDefined();
  });

  it('files one inbox row for the person who asked, opening the review, until it is applied', async () => {
    const { changeSetId, eventId } = await placed(3);
    expect(await fanOutEvent(db.pool, eventId)).toMatchObject({ filed: 1 });
    // A replay files nothing twice.
    expect(await fanOutEvent(db.pool, eventId)).toMatchObject({ filed: 0 });
    const filed = await rowsFor(changeSetId);
    expect(filed).toHaveLength(1);
    expect(filed[0]).toMatchObject({
      user_id: linh,
      data: { change_set_id: changeSetId, count: 3 },
      deep_link: `/trip/${tripId}/review/${changeSetId}`,
      needs_you: true,
      resolved: false,
    });

    const applied = await insertEvent(
      db.pool,
      'change_set.applied',
      { trip_id: tripId, change_set_id: changeSetId, result_version_id: versionId },
      { crewId, tripId, actorId: linh },
    );
    expect(await fanOutEvent(db.pool, applied)).toMatchObject({ resolved: 1 });
    expect((await rowsFor(changeSetId))[0]?.resolved).toBe(true);
  });

  it('files nothing when nothing was placed', async () => {
    const { changeSetId, eventId } = await placed(0);
    expect(await fanOutEvent(db.pool, eventId)).toMatchObject({ filed: 0 });
    expect(await rowsFor(changeSetId)).toEqual([]);
  });
});
