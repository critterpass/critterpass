/**
 * The invite link providers against a migrated Postgres: a personal link previews the invitee's
 * first name only while the named seat is open (then reads as the crew link), a trip link shows
 * its seats, human opens count for the inviter alone, and a verified phone matching a pending
 * personal invite binds that invite to the account.
 */
import { crypto as dbCrypto, withSystem } from '@cp/db';
import type { LinkTarget } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createInviteLinkProvider, phoneInviteMatcher } from '../../src/links/providers/invite';
import { runCommand } from '../location/location-fixture';
import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';
import {
  PHONE_PEPPER,
  resultOf,
  startCrew,
  startInviteHarness,
  testInviteDeps,
  tripWithSeats,
} from './invite-fixture';

let harness: CommandDoorsHarness;
let inviter: SignedIn;
const provider = createInviteLinkProvider(testInviteDeps.fieldKeyring);

beforeAll(async () => {
  harness = await startInviteHarness();
  inviter = await harness.signInAnonymously();
  await harness.promoteToRegistered(inviter.uid);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function personalLink(tripSeats: number, phone?: string) {
  const crew = await startCrew(harness, inviter);
  const tripId = await tripWithSeats(harness, crew, inviter, tripSeats);
  const created = await runCommand(harness, inviter, 'create_invite', {
    crew_id: crew,
    trip_id: tripId,
    channel: 'contact',
    contact: { name: 'Dev Patel', ...(phone === undefined ? {} : { phone_e164: phone }) },
  });
  const { invite_id: inviteId, link } = resultOf(created.body) as Record<string, string>;
  const [, , code, seat] = link!.split('/');
  const target: LinkTarget = { kind: 'invite', code: code!, seat: seat! };
  return { crew, tripId, inviteId: inviteId!, target, code: code!, seat: seat! };
}

const preview = (target: LinkTarget) =>
  withSystem(harness.pool, (tx) => provider.preview({ tx, target, now: new Date() }));

describe('personal link previews', () => {
  it('names the invitee and shows the seats until the named seat is claimed', async () => {
    const link = await personalLink(3);
    expect(await preview(link.target)).toMatchObject({
      kind: 'invite',
      crew_name: 'Bali',
      invitee_first_name: 'Dev',
      seats_taken: 3,
      seat_cap: 6,
      state: 'active',
      invitee_home_hint: null,
      invitee_tags: [],
      invited_waiting: 0,
    });
    expect((await preview(link.target))?.members).toHaveLength(3);
    const dev = await harness.signInAnonymously();
    await runCommand(harness, dev, 'accept_invite', { code: link.code, seat: link.seat });
    expect(await preview(link.target)).toMatchObject({
      invitee_first_name: null,
      seats_taken: 4,
      state: 'active',
    });
    expect(await preview({ kind: 'invite', code: link.code })).not.toHaveProperty(
      'invitee_first_name',
    );
  });

  it('counts human opens for the inviter only', async () => {
    const link = await personalLink(1);
    for (let i = 0; i < 2; i += 1) {
      await withSystem(harness.pool, (tx) =>
        provider.recordOpen!({ tx, target: link.target, now: new Date() }),
      );
    }
    const { rows } = await harness.pool.query<{ inviter_id: string; open_count: number }>(
      'SELECT inviter_id, open_count FROM invite_opens WHERE id = $1',
      [link.inviteId],
    );
    expect(rows).toEqual([{ inviter_id: inviter.uid, open_count: 2 }]);
  });
});

describe('phone match', () => {
  it('binds a pending personal invite to the account whose verified phone it names', async () => {
    const link = await personalLink(1, '+6598765432');
    const dev = await harness.signInAnonymously();
    const phoneHash = dbCrypto.hashWithPepper('+6598765432', PHONE_PEPPER);
    const match = await withSystem(harness.pool, (tx) =>
      phoneInviteMatcher(tx, { uid: dev.uid, phoneHash }),
    );
    expect(match?.resolved).toMatchObject({ kind: 'invite', inviteId: link.inviteId });
    const { rows } = await harness.pool.query('SELECT invitee_user_id FROM invites WHERE id = $1', [
      link.inviteId,
    ]);
    expect(rows).toEqual([{ invitee_user_id: dev.uid }]);
    const joined = await runCommand(harness, dev, 'accept_invite', { invite_id: link.inviteId });
    expect(resultOf(joined.body)).toMatchObject({ seated: true, invite_id: link.inviteId });

    const nobody = await withSystem(harness.pool, (tx) =>
      phoneInviteMatcher(tx, { uid: dev.uid, phoneHash: 'f'.repeat(64) }),
    );
    expect(nobody).toBeNull();
  });
});
