/**
 * `avatars` (docs/data-model.md §3.1): crew-visible, owner-inserted, and never self-approved: an
 * owner can only add a photo as `pending` (or a critter/initials avatar as `none`), and only the
 * system moves a photo through moderation. `users.avatar_id` points at the current row.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import type { ActorKind } from '../helpers/fixtures';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let avatarId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { rows } = await harness.db.pool.query<{ id: string }>(
    'SELECT id FROM avatars WHERE user_id = $1',
    [harness.fixture.actors.organiser],
  );
  avatarId = rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

function asUser<T>(uid: string, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  return withUser(harness.db.pool, uid, anonymousActor().device, fn);
}

async function visibleTo(actor: ActorKind): Promise<boolean> {
  return asUser(harness.fixture.actors[actor], async (tx) => {
    const { rows } = await tx.query('SELECT 1 FROM avatars WHERE id = $1', [avatarId]);
    return rows.length === 1;
  });
}

function photoKey(uid: string): string {
  return `u/${uid}/avatar/${crypto.randomUUID()}`;
}

describe('avatars RLS', () => {
  it.each(['organiser', 'coOrganiser', 'member'] as const)(
    "lets the %s see the organiser's avatar",
    async (actor) => {
      expect(await visibleTo(actor)).toBe(true);
    },
  );

  it.each(['outsider', 'exMember', 'anonymous'] as const)('hides it from the %s', async (a) => {
    expect(await visibleTo(a)).toBe(false);
  });

  it('lets an owner add a pending photo and point users.avatar_id at it', async () => {
    const uid = harness.fixture.actors.member;
    const id = crypto.randomUUID();
    await asUser(uid, async (tx) => {
      await tx.query(
        `INSERT INTO avatars (id, user_id, kind, media_key, moderation_status)
         VALUES ($1, $2, 'photo', $3, 'pending')`,
        [id, uid, photoKey(uid)],
      );
      await tx.query('UPDATE users SET avatar_id = $1 WHERE id = $2', [id, uid]);
    });
    const { rows } = await harness.db.pool.query('SELECT avatar_id FROM users WHERE id = $1', [
      uid,
    ]);
    expect(rows).toEqual([{ avatar_id: id }]);
  });

  it('never lets an owner approve their own photo, directly or on insert', async () => {
    const uid = harness.fixture.actors.member;
    await expect(
      asUser(uid, (tx) =>
        tx.query(
          `INSERT INTO avatars (user_id, kind, media_key, moderation_status)
           VALUES ($1, 'photo', $2, 'approved')`,
          [uid, photoKey(uid)],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(uid, (tx) =>
        tx.query("UPDATE avatars SET moderation_status = 'approved' WHERE user_id = $1", [uid]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('refuses an avatar for someone else and a photo avatar without a key', async () => {
    const { actors } = harness.fixture;
    await expect(
      asUser(actors.member, (tx) =>
        tx.query("INSERT INTO avatars (user_id, kind) VALUES ($1, 'initials')", [actors.organiser]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(actors.member, (tx) =>
        tx.query(
          "INSERT INTO avatars (user_id, kind, moderation_status) VALUES ($1, 'photo', 'pending')",
          [actors.member],
        ),
      ),
    ).rejects.toThrow(/avatars_shape_check/);
  });

  it('lets the system approve a photo and record its rendered variants', async () => {
    const uid = harness.fixture.actors.coOrganiser;
    const id = crypto.randomUUID();
    await asUser(uid, (tx) =>
      tx.query(
        `INSERT INTO avatars (id, user_id, kind, media_key, moderation_status)
         VALUES ($1, $2, 'photo', $3, 'pending')`,
        [id, uid, photoKey(uid)],
      ),
    );
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        `UPDATE avatars SET moderation_status = 'approved', variant_keys = '{"40": "k"}'
         WHERE id = $1`,
        [id],
      ),
    );
    const seen = await asUser(
      harness.fixture.actors.organiser,
      async (tx) =>
        (
          await tx.query<{ moderation_status: string }>(
            'SELECT moderation_status FROM avatars WHERE id = $1',
            [id],
          )
        ).rows,
    );
    expect(seen).toEqual([{ moderation_status: 'approved' }]);
  });
});

describe('avatars in sync streams', () => {
  it('syncs to its owner on me and to an active crewmate on crew_people', async () => {
    expect(idsByTable(await harness.rows('me', 'organiser'))['avatars']).toEqual([avatarId]);
    expect(idsByTable(await harness.rows('crew_people', 'member'))['avatars']).toContain(avatarId);
  });

  it.each(['outsider', 'exMember', 'anonymous'] as const)('never syncs it to the %s', async (a) => {
    const people = idsByTable(await harness.rows('crew_people', a))['avatars'] ?? [];
    expect(people).not.toContain(avatarId);
  });
});
