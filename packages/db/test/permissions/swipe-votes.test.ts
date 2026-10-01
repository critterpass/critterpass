/**
 * `swipe_votes` holds every swipe verdict, so it holds every "no": its voter alone reads a vote;
 * the crew sees yes votes only, through `swipe_yes_votes`, which a trigger keeps in step as a vote
 * flips or is undone. The table is outside the publication, closed to replication and the guide,
 * and no stream replicates a verdict: the test reads what each actor's trip stream would sync.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { asRole, visibleRows } from '../helpers/setup-privacy';
import type { ActorKind } from '../helpers/fixtures';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const noVotes = "SELECT 1 FROM swipe_votes WHERE trip_id = $1 AND verdict = 'no'";

async function voteRow(uid: string): Promise<{ id: string; session_id: string; poi_id: string }> {
  const { rows } = await harness.db.pool.query<{ id: string; session_id: string; poi_id: string }>(
    'SELECT id, session_id, poi_id FROM swipe_votes WHERE user_id = $1 AND trip_id = $2',
    [uid, harness.fixture.tripId],
  );
  return rows[0]!;
}

async function syncedYesVoters(kind: ActorKind): Promise<unknown[]> {
  const rows = await harness.rows('trip', kind, { trip_id: harness.fixture.tripId });
  expect([...rows.keys()]).not.toContain('swipe_votes');
  return (rows.get('swipe_yes_votes') ?? []).map((row) => row['user_id']);
}

describe('swipe_votes', () => {
  it('shows a vote to its voter only; nobody else reads a "no"', async () => {
    const { actors, tripId } = harness.fixture;
    const own = 'SELECT 1 FROM swipe_votes WHERE user_id = app.uid() AND trip_id = $1';
    expect(await visibleRows(harness, actors.member, own, [tripId])).toBe(1);
    expect(await visibleRows(harness, actors.member, noVotes, [tripId])).toBe(1);
    for (const kind of ['organiser', 'coOrganiser', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], noVotes, [tripId]), kind).toBe(0);
    }
  });

  it('mirrors yes votes only to the crew, directly and through the trip stream', async () => {
    const { actors, tripId } = harness.fixture;
    const yes = 'SELECT user_id FROM swipe_yes_votes WHERE trip_id = $1';
    for (const kind of ['member', 'coOrganiser', 'organiser'] as const) {
      expect(await visibleRows(harness, actors[kind], yes, [tripId]), kind).toBe(1);
      expect(await syncedYesVoters(kind), kind).toEqual([actors.organiser]);
    }
    for (const kind of ['exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], yes, [tripId]), kind).toBe(0);
      expect(await syncedYesVoters(kind), kind).toEqual([]);
    }
  });

  it('drops the mirrored yes when the vote flips to no or is undone', async () => {
    const { actors } = harness.fixture;
    const vote = await voteRow(actors.organiser);
    await withSystem(harness.db.pool, (tx) =>
      tx.query("UPDATE swipe_votes SET verdict = 'no' WHERE id = $1", [vote.id]),
    );
    expect(await syncedYesVoters('member')).toEqual([]);
    await withSystem(harness.db.pool, (tx) =>
      tx.query("UPDATE swipe_votes SET verdict = 'super' WHERE id = $1", [vote.id]),
    );
    expect(await syncedYesVoters('member')).toEqual([actors.organiser]);
    await withSystem(harness.db.pool, (tx) =>
      tx.query('DELETE FROM swipe_votes WHERE id = $1', [vote.id]),
    );
    expect(await syncedYesVoters('member')).toEqual([]);
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        `INSERT INTO swipe_votes (session_id, trip_id, user_id, poi_id, verdict)
         VALUES ($1, $2, $3, $4, 'yes')`,
        [vote.session_id, harness.fixture.tripId, actors.organiser, vote.poi_id],
      ),
    );
    expect(await syncedYesVoters('member')).toEqual([actors.organiser]);
  });

  it('is outside the publication and closed to replication and the guide', async () => {
    const { rows } = await harness.db.pool.query(
      "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'swipe_votes'",
    );
    expect(rows).toHaveLength(0);
    await expect(
      asRole(harness.db.pool, 'powersync_repl', 'SELECT verdict FROM swipe_votes'),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withGuideReader(
        harness.db.pool,
        harness.fixture.actors.organiser,
        harness.fixture.tripId,
        (tx) => tx.query('SELECT 1 FROM swipe_votes'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('is never written by app_user, not even the voter', async () => {
    const { actors, tripId } = harness.fixture;
    const vote = await voteRow(actors.member);
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query("UPDATE swipe_votes SET verdict = 'yes' WHERE id = $1", [vote.id]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query(
          `INSERT INTO swipe_yes_votes (session_id, trip_id, user_id, poi_id)
           VALUES ($1, $2, $3, $4)`,
          [vote.session_id, tripId, actors.member, vote.poi_id],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
