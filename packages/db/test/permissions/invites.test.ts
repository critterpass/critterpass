/**
 * `invites` (RLS class M plus the two people it names) and `invite_opens` (RLS class O on the
 * inviter): crew members read and manage their crew's invites, an in-app invitee reads and answers
 * their own invite before joining, ex-members and outsiders see nothing, and link opens reach the
 * inviter only. The sync streams mirror the same boundary and never carry the seat token hash.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { insertInvite } from '../helpers/growth-fixture';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let inAppInvite: string;

function as<T>(uid: string, sql: string, params: unknown[] = []) {
  return withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query<T & object>(sql, params));
}

beforeAll(async () => {
  harness = await startStreamHarness();
  const { fixture } = harness;
  inAppInvite = await withSystem(harness.db.pool, (tx) =>
    insertInvite(tx, {
      crewId: fixture.crewId,
      inviterId: fixture.actors.member,
      personal: false,
      inviteeUserId: fixture.actors.outsider,
    }),
  );
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('invites: who reads', () => {
  it('shows the crew its invites and hides them from ex-members and strangers', async () => {
    const { actors, crewId } = harness.fixture;
    const sql = 'SELECT id FROM invites WHERE crew_id = $1';
    expect((await as(actors.member, sql, [crewId])).rows).toHaveLength(2);
    expect((await as(actors.organiser, sql, [crewId])).rows).toHaveLength(2);
    expect((await as(actors.exMember, sql, [crewId])).rows).toEqual([]);
    expect((await as(actors.anonymous, sql, [crewId])).rows).toEqual([]);
  });

  it('lets an in-app invitee read only their own invite before they join', async () => {
    const { rows } = await as<{ id: string }>(
      harness.fixture.actors.outsider,
      'SELECT id FROM invites',
    );
    expect(rows.map((row) => row.id)).toEqual([inAppInvite]);
  });
});

describe('invites: who writes', () => {
  it('lets a member invite into their own crew only as themselves', async () => {
    const { actors, crewId } = harness.fixture;
    const insert = (uid: string, inviter: string) =>
      as(
        uid,
        `INSERT INTO invites (crew_id, inviter_id, kind, expires_at)
         VALUES ($1, $2, 'generic', now() + interval '1 day')`,
        [crewId, inviter],
      );
    await expect(insert(actors.member, actors.member)).resolves.toBeDefined();
    await expect(insert(actors.member, actors.organiser)).rejects.toThrow(/row-level security/i);
    await expect(insert(actors.outsider, actors.outsider)).rejects.toThrow(/row-level security/i);
    await expect(insert(actors.exMember, actors.exMember)).rejects.toThrow(/row-level security/i);
  });

  it('lets members and the invitee move status, never the token, inviter or crew', async () => {
    const { actors } = harness.fixture;
    const decline = await as(
      actors.outsider,
      "UPDATE invites SET status = 'declined' WHERE id = $1",
      [inAppInvite],
    );
    expect(decline.rowCount).toBe(1);
    await expect(
      as(actors.member, 'UPDATE invites SET inviter_id = $2 WHERE id = $1', [
        inAppInvite,
        actors.member,
      ]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(actors.member, "UPDATE invites SET seat_token_hash = repeat('a', 64) WHERE id = $1", [
        inAppInvite,
      ]),
    ).rejects.toThrow(/permission denied/i);
    const stranger = await as(
      actors.exMember,
      "UPDATE invites SET status = 'claimed' WHERE id = $1",
      [inAppInvite],
    );
    expect(stranger.rowCount).toBe(0);
  });

  it('never lets app_user delete an invite', async () => {
    await expect(
      as(harness.fixture.actors.organiser, 'DELETE FROM invites WHERE id = $1', [inAppInvite]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('invite_opens: the inviter alone', () => {
  it('shows opens to the inviter and nobody else, and takes no app_user writes', async () => {
    const { actors } = harness.fixture;
    const sql = 'SELECT open_count FROM invite_opens';
    expect((await as(actors.organiser, sql)).rows).toEqual([{ open_count: 1 }]);
    for (const uid of [actors.member, actors.coOrganiser, actors.exMember, actors.outsider]) {
      expect((await as(uid, sql)).rows).toEqual([]);
    }
    await expect(as(actors.organiser, 'UPDATE invite_opens SET open_count = 0')).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('invite sync streams', () => {
  it('syncs crew invites to members without the seat token hash, nothing to ex-members', async () => {
    const member = await harness.rows('crew_invites', 'member');
    const invites = member.get('invites') ?? [];
    expect(invites.length).toBeGreaterThanOrEqual(2);
    for (const row of invites) expect(row).not.toHaveProperty('seat_token_hash');
    for (const row of invites) expect(row).not.toHaveProperty('nudged_at');
    expect(idsByTable(await harness.rows('crew_invites', 'exMember'))['invites'] ?? []).toEqual([]);
    expect(idsByTable(await harness.rows('crew_invites', 'outsider'))['invites']).toEqual([
      inAppInvite,
    ]);
  });

  it('syncs invite opens only to the inviter', async () => {
    expect((await harness.rows('me', 'organiser')).get('invite_opens')).toHaveLength(1);
    expect((await harness.rows('me', 'member')).get('invite_opens') ?? []).toEqual([]);
  });
});
