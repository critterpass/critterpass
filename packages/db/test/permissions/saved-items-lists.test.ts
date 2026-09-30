/**
 * `saved_lists` and `saved_items`: a traveller's lists and saves are theirs alone, directly and on
 * their `me` stream; a list is created and renamed by its owner and removed by the server (its
 * command moves the list's items back to "Saved"). A place page saves a POI as kind `poi`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const lists = 'SELECT 1 FROM saved_lists WHERE user_id = $1';

describe('saved_lists', () => {
  it("is its owner's alone, directly and on the me stream", async () => {
    const { actors } = harness.fixture;
    expect(await visibleRows(harness, actors.organiser, lists, [actors.organiser])).toBe(1);
    expect((await harness.rows('me', 'organiser')).get('saved_lists')).toHaveLength(1);
    for (const kind of ['member', 'coOrganiser', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], lists, [actors.organiser]), kind).toBe(0);
      expect((await harness.rows('me', kind)).get('saved_lists') ?? [], kind).toHaveLength(0);
    }
  });

  it('lets the owner create and rename, never write for someone else or delete', async () => {
    const { actors } = harness.fixture;
    const as = (uid: string, sql: string, params: unknown[]) =>
      withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));
    await as(actors.member, 'INSERT INTO saved_lists (user_id, name) VALUES ($1, $2)', [
      actors.member,
      'Kyoto',
    ]);
    await as(actors.member, "UPDATE saved_lists SET name = 'Kyoto eats' WHERE user_id = $1", [
      actors.member,
    ]);
    await expect(
      as(actors.member, 'INSERT INTO saved_lists (user_id, name) VALUES ($1, $2)', [
        actors.organiser,
        'Theirs',
      ]),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      as(actors.member, 'DELETE FROM saved_lists WHERE user_id = $1', [actors.member]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('saved_items', () => {
  it('keeps a saved POI as kind poi, visible to its owner only', async () => {
    const { actors } = harness.fixture;
    const { rows } = await harness.db.pool.query<{ id: string }>('SELECT id FROM pois LIMIT 1');
    await withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
      tx.query(
        "INSERT INTO saved_items (user_id, kind, ref_id, list_name) VALUES ($1, 'poi', $2, 'Kyoto eats')",
        [actors.member, rows[0]!.id],
      ),
    );
    const probe = "SELECT 1 FROM saved_items WHERE kind = 'poi' AND user_id = $1";
    expect(await visibleRows(harness, actors.member, probe, [actors.member])).toBe(1);
    expect(await visibleRows(harness, actors.organiser, probe, [actors.member])).toBe(0);
  });
});
