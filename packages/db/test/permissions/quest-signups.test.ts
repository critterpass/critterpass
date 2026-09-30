/**
 * `quest_signups` (C1): a traveller signs themselves up for a quest on their own trip, never someone
 * else and never on a trip they are not on; the trip reads the sign-ups.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let questId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { rows } = await harness.db.pool.query<{ id: string }>(
    'SELECT id FROM quests WHERE trip_id = $1',
    [harness.fixture.tripId],
  );
  questId = rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const signUp = (uid: string, userId: string) =>
  withUser(harness.db.pool, uid, randomUUID(), (tx) =>
    tx.query('INSERT INTO quest_signups (quest_id, trip_id, user_id) VALUES ($1, $2, $3)', [
      questId,
      harness.fixture.tripId,
      userId,
    ]),
  );

describe('quest_signups', () => {
  it('lets a traveller sign themselves up, once', async () => {
    const { actors } = harness.fixture;
    await expect(signUp(actors.member, actors.member)).resolves.toBeDefined();
    await expect(signUp(actors.member, actors.member)).rejects.toThrow(/quest_user_key/);
  });

  it('rejects signing up someone else, or on a trip the caller is not on', async () => {
    const { actors } = harness.fixture;
    await expect(signUp(actors.member, actors.coOrganiser)).rejects.toThrow(/row-level security/);
    await expect(signUp(actors.outsider, actors.outsider)).rejects.toThrow(/row-level security/);
  });

  it('shows the sign-ups to the trip only', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM quest_signups WHERE user_id = $1';
    expect(await visibleRows(harness, actors.member, probe, [actors.organiser])).toBe(1);
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [actors.organiser]), kind).toBe(0);
    }
    const synced = await harness.rows('trip', 'outsider', { trip_id: tripId });
    expect(synced.get('quest_signups') ?? []).toEqual([]);
  });

  it('is never withdrawn or edited by a client', async () => {
    const { actors } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('DELETE FROM quest_signups WHERE user_id = $1', [actors.organiser]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
