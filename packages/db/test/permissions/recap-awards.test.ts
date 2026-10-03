/**
 * `recap_awards` (C1, RLS T via the viewer list) and `recap_mvp_votes` (C2, voter only): the
 * travellers in the crew read every award with its tally on the trip stream; a vote is read and
 * synced only by its voter, inserted only by a traveller for themself, and only once per recap.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { expectCrewReadOnly, visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let recapId: string;
let awardId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { tripId, actors } = harness.fixture;
  [recapId, awardId] = await withSystem(harness.db.pool, async (tx) => {
    const { rows } = await tx.query<{ recap_id: string; id: string }>(
      'SELECT recap_id, id FROM recap_awards WHERE trip_id = $1 AND user_id = $2',
      [tripId, actors.member],
    );
    return [rows[0]!.recap_id, rows[0]!.id] as const;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const vote = (uid: string, voter: string) =>
  withUser(harness.db.pool, uid, randomUUID(), (tx) =>
    tx.query(
      'INSERT INTO recap_mvp_votes (recap_id, trip_id, voter_id, award_id) VALUES ($1, $2, $3, $4)',
      [recapId, harness.fixture.tripId, voter, awardId],
    ),
  );

describe('recap_awards', () => {
  it('is read by the travellers only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'recap_awards');
  });
});

describe('recap_mvp_votes', () => {
  it('is read and synced by its voter only', async () => {
    const { tripId, actors } = harness.fixture;
    const probe = 'SELECT 1 FROM recap_mvp_votes WHERE trip_id = $1';
    expect(await visibleRows(harness, actors.organiser, probe, [tripId])).toBe(1);
    expect(await visibleRows(harness, actors.member, probe, [tripId])).toBe(1);
    for (const kind of ['coOrganiser', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
    const own = await harness.rows('trip_me', 'member', { trip_id: tripId });
    expect(own.get('recap_mvp_votes')?.map((row) => row['voter_id'])).toEqual([actors.member]);
  });

  it('lets a traveller vote once for themself, and nobody vote as someone else', async () => {
    const { actors } = harness.fixture;
    await expect(vote(actors.coOrganiser, actors.organiser)).rejects.toThrow(/row-level security/i);
    await expect(vote(actors.outsider, actors.outsider)).rejects.toThrow(/row-level security/i);
    await expect(vote(actors.coOrganiser, actors.coOrganiser)).resolves.toBeDefined();
    await expect(vote(actors.coOrganiser, actors.coOrganiser)).rejects.toThrow(
      /recap_mvp_votes_recap_voter_key/,
    );
    await expect(vote(actors.member, actors.member)).rejects.toThrow(
      /recap_mvp_votes_recap_voter_key/,
    );
  });
});
