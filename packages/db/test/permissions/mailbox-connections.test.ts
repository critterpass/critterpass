/**
 * `mailbox_connections` (C3, RLS X): the owner reads the provider and status of their grant; the
 * refresh token and the incremental cursor are unreadable through app_user even to them, and no
 * peer, guide_reader, replication role, publication or stream sees the table at all.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { expectSealed } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('mailbox connections', () => {
  it('is readable by its owner only, and by no role, publication or stream', async () => {
    await expectSealed(harness, 'mailbox_connections', { owner: 'organiser' });
  });

  it('never selects the token or the cursor, not even for the owner', async () => {
    const { actors } = harness.fixture;
    for (const column of ['refresh_token_enc', 'last_history_id']) {
      await expect(
        withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
          tx.query(`SELECT ${column} FROM mailbox_connections`),
        ),
        column,
      ).rejects.toThrow(/permission denied/i);
    }
    const { rows } = await withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
      tx.query<{ provider: string; status: string }>(
        'SELECT provider, status FROM mailbox_connections',
      ),
    );
    expect(rows).toEqual([{ provider: 'gmail', status: 'active' }]);
  });

  it('refuses direct writes', async () => {
    const { actors } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query("UPDATE mailbox_connections SET status = 'paused'"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
