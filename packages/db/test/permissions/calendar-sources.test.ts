/**
 * `calendar_sources` (C3, RLS X): a member's calendar connections are theirs alone; the OAuth
 * token envelope is unreadable even to its owner through app_user, and only the server writes it.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { expectSealed } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const as = (uid: string, sql: string, params: unknown[] = []) =>
  withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));

describe('calendar_sources', () => {
  it('is readable by its owner only, and by no role, publication or stream besides', async () => {
    await expectSealed(harness, 'calendar_sources', { owner: 'organiser' });
  });

  it('never lets app_user read the token envelope, its owner included', async () => {
    const { organiser } = harness.fixture.actors;
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        `INSERT INTO calendar_sources (user_id, kind, oauth_tokens_enc)
         VALUES ($1, 'oauth_google', 'v1:k:iv:tag:ct')`,
        [organiser],
      ),
    );
    await expect(as(organiser, 'SELECT oauth_tokens_enc FROM calendar_sources')).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      as(organiser, "UPDATE calendar_sources SET oauth_tokens_enc = 'x' WHERE user_id = $1", [
        organiser,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets a member add only their own device or manual source', async () => {
    const { member, organiser } = harness.fixture.actors;
    await expect(
      as(member, "INSERT INTO calendar_sources (user_id, kind) VALUES ($1, 'oauth_microsoft')", [
        member,
      ]),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      as(member, "INSERT INTO calendar_sources (user_id, kind) VALUES ($1, 'manual')", [organiser]),
    ).rejects.toThrow(/row-level security/i);
    await as(member, "INSERT INTO calendar_sources (user_id, kind) VALUES ($1, 'manual')", [
      member,
    ]);
    const updated = await as(
      member,
      'UPDATE calendar_sources SET consent_tentative = true WHERE user_id = $1',
      [organiser],
    );
    expect(updated.rowCount).toBe(0);
  });
});
