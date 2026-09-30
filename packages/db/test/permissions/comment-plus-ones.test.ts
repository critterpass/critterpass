/**
 * comment_plus_ones: one +1 per member per comment, only in the member's own name; the trip id is
 * copied from the comment (a client cannot file it under another trip), a tombstoned comment takes
 * none, and taking a +1 back is the server's delete.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow } from '../helpers/actors';
import { buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;
let commentId: string;

const device = anonymousActor().device;

const plusOne = (uid: string, forUid = uid, id = commentId) =>
  withUser(db.pool, uid, device, (tx) =>
    tx.query('INSERT INTO comment_plus_ones (comment_id, user_id) VALUES ($1, $2)', [id, forUid]),
  );

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
  commentId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO comments (trip_id, anchor_kind, anchor_id, author_id, body)
       VALUES ($1, 'day', '3', $2, 'Beach day?') RETURNING id`,
      [fixture.tripId, fixture.actors.organiser],
    );
    return firstRow(rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('comment_plus_ones', () => {
  it('takes one +1 per member, in their own name only', async () => {
    await plusOne(fixture.actors.coOrganiser);
    await expect(plusOne(fixture.actors.coOrganiser)).rejects.toThrow(/duplicate key/i);
    await expect(plusOne(fixture.actors.member, fixture.actors.coOrganiser)).rejects.toThrow(
      /row-level security/i,
    );
    await expect(plusOne(fixture.actors.outsider)).rejects.toThrow(/row-level security/i);
    const { rows } = await withSystem(db.pool, (tx) =>
      tx.query<{ trip_id: string }>('SELECT trip_id FROM comment_plus_ones WHERE comment_id = $1', [
        commentId,
      ]),
    );
    expect(rows.map((row) => row.trip_id)).toContain(fixture.tripId);
  });

  it.each([
    ['outsider', 0],
    ['exMember', 0],
    ['member', 1],
  ] as const)('the %s sees %i +1 on the comment', async (actor, count) => {
    const { rowCount } = await withUser(db.pool, fixture.actors[actor], device, (tx) =>
      tx.query('SELECT 1 FROM comment_plus_ones WHERE comment_id = $1 AND user_id = $2', [
        commentId,
        fixture.actors.coOrganiser,
      ]),
    );
    expect(rowCount).toBe(count);
  });

  it('refuses a +1 on a tombstone and leaves deletes to the server', async () => {
    const gone = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO comments (trip_id, anchor_kind, anchor_id, author_id, body, deleted_at)
         VALUES ($1, 'day', '4', $2, '', now()) RETURNING id`,
        [fixture.tripId, fixture.actors.organiser],
      );
      return firstRow(rows).id;
    });
    await expect(plusOne(fixture.actors.member, fixture.actors.member, gone)).rejects.toThrow(
      /does not take/,
    );
    await expect(
      withUser(db.pool, fixture.actors.coOrganiser, device, (tx) =>
        tx.query('DELETE FROM comment_plus_ones WHERE user_id = $1', [fixture.actors.coOrganiser]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
