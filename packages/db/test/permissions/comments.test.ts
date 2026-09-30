/**
 * comments: the trip's crew reads every comment on it and writes as themselves; only the author
 * edits or tombstones their own, and a tombstone carries no body. Nobody outside the crew reads
 * one, and nobody deletes a row.
 */
import type pg from 'pg';
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

const device = anonymousActor().device;
const as = <T>(uid: string, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> =>
  withUser(db.pool, uid, device, fn);

async function postAs(uid: string, body = 'Too far on foot?'): Promise<string> {
  return as(uid, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO comments (trip_id, anchor_kind, anchor_id, author_id, body)
       VALUES ($1, 'item', '0190f0a0-0000-7000-8000-000000000001', $2, $3) RETURNING id`,
      [fixture.tripId, uid, body],
    );
    return firstRow(rows).id;
  });
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('comments visibility', () => {
  it.each([
    ['outsider', 0],
    ['exMember', 0],
    ['anonymous', 0],
    ['member', 1],
    ['coOrganiser', 1],
  ] as const)('the %s reads %i of a member comment', async (actor, count) => {
    const id = await postAs(fixture.actors.member);
    const { rowCount } = await as(fixture.actors[actor], (tx) =>
      tx.query('SELECT 1 FROM comments WHERE id = $1', [id]),
    );
    expect(rowCount).toBe(count);
  });
});

describe('comments writes', () => {
  it('refuses a non-participant and a comment written in someone else’s name', async () => {
    await expect(postAs(fixture.actors.outsider)).rejects.toThrow(/row-level security/i);
    await expect(
      as(fixture.actors.member, (tx) =>
        tx.query(
          `INSERT INTO comments (trip_id, anchor_kind, anchor_id, author_id, body)
           VALUES ($1, 'day', '2', $2, 'Posing as the organiser')`,
          [fixture.tripId, fixture.actors.organiser],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('lets only the author edit and tombstone; a tombstone has no body', async () => {
    const id = await postAs(fixture.actors.member);
    const edit = (uid: string) =>
      as(uid, (tx) =>
        tx.query("UPDATE comments SET body = 'Edited', edited_at = now() WHERE id = $1", [id]),
      );
    expect((await edit(fixture.actors.organiser)).rowCount).toBe(0);
    expect((await edit(fixture.actors.member)).rowCount).toBe(1);
    await expect(
      as(fixture.actors.member, (tx) =>
        tx.query('UPDATE comments SET deleted_at = now() WHERE id = $1', [id]),
      ),
    ).rejects.toThrow(/comments_tombstone_is_empty/);
    const tombstoned = await as(fixture.actors.member, (tx) =>
      tx.query("UPDATE comments SET body = '', deleted_at = now() WHERE id = $1", [id]),
    );
    expect(tombstoned.rowCount).toBe(1);
  });

  it('never lets a participant move a comment to another trip or delete it', async () => {
    const id = await postAs(fixture.actors.member);
    await expect(
      as(fixture.actors.member, (tx) =>
        tx.query('UPDATE comments SET trip_id = trip_id WHERE id = $1', [id]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(fixture.actors.member, (tx) => tx.query('DELETE FROM comments WHERE id = $1', [id])),
    ).rejects.toThrow(/permission denied/i);
    const { rows } = await withSystem(db.pool, (tx) =>
      tx.query('SELECT 1 FROM comments WHERE id = $1', [id]),
    );
    expect(rows).toHaveLength(1);
  });
});
