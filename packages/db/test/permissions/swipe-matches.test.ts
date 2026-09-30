/**
 * `swipe_matches`: the trip's crew reads a session's matches (directly and on the trip stream);
 * nobody outside it does; only the server writes one, and a card matches once per session.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const probe = 'SELECT 1 FROM swipe_matches WHERE trip_id = $1';

describe('swipe_matches', () => {
  it('is read by the trip crew only, directly and through the trip stream', async () => {
    const { actors, tripId } = harness.fixture;
    for (const kind of ['member', 'coOrganiser', 'organiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(1);
      const synced = await harness.rows('trip', kind, { trip_id: tripId });
      expect(synced.get('swipe_matches'), kind).toHaveLength(1);
    }
    for (const kind of ['exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
  });

  it('matches a card once per session and is never written by app_user', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO swipe_matches (session_id, trip_id, poi_id, user_ids)
           SELECT session_id, trip_id, poi_id, user_ids FROM swipe_matches WHERE trip_id = $1`,
          [tripId],
        ),
      ),
    ).rejects.toThrow(/swipe_matches_session_poi_key/);
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('UPDATE swipe_matches SET day_no = 1 WHERE trip_id = $1', [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
