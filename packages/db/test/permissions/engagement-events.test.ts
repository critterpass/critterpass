/**
 * `engagement_events` (C2, RLS S): passive signals. Nobody reads them through app_user — not the
 * organiser, not a peer, not even the member who opened — and they never replicate. A recipient
 * records their own only through `app.record_engagement`, which refuses anyone else.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { expectSealed } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let proposalId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { rows } = await harness.db.pool.query<{ id: string }>(
    'SELECT id FROM proposals WHERE trip_id = $1',
    [harness.fixture.tripId],
  );
  proposalId = rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function opens(): Promise<number> {
  const { rows } = await harness.db.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM engagement_events WHERE proposal_id = $1',
    [proposalId],
  );
  return rows[0]!.n;
}

describe('engagement_events', () => {
  it('is sealed from every actor, guide_reader, replication and every stream', async () => {
    await expectSealed(harness, 'engagement_events', { owner: null });
  });

  it('records a recipient open through the definer function, and nothing for anyone else', async () => {
    const { actors } = harness.fixture;
    const before = await opens();
    await withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
      tx.query("SELECT app.record_engagement($1, 'opened', 20)", [proposalId]),
    );
    expect(await opens()).toBe(before + 1);
    for (const kind of ['organiser', 'outsider', 'exMember'] as const) {
      await expect(
        withUser(harness.db.pool, actors[kind], randomUUID(), (tx) =>
          tx.query("SELECT app.record_engagement($1, 'opened', 20)", [proposalId]),
        ),
        kind,
      ).rejects.toThrow(/not a recipient/i);
    }
    expect(await opens()).toBe(before + 1);
  });

  it('cannot be inserted directly by a recipient', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query(
          `INSERT INTO engagement_events (proposal_id, trip_id, user_id, kind)
           VALUES ($1, $2, $3, 'opened')`,
          [proposalId, tripId, actors.member],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
