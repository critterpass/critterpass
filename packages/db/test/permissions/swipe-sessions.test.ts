/**
 * `swipe_sessions`: the trip's crew reads its sessions (directly and on the trip stream); nobody
 * outside it does, and only the server writes one. One session per trip may be open at a time.
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

const probe = 'SELECT 1 FROM swipe_sessions WHERE trip_id = $1';

describe('swipe_sessions', () => {
  it('is read by the trip crew only, directly and through the trip stream', async () => {
    const { actors, tripId } = harness.fixture;
    for (const kind of ['member', 'coOrganiser', 'organiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(1);
      const synced = await harness.rows('trip', kind, { trip_id: tripId });
      expect(synced.get('swipe_sessions'), kind).toHaveLength(1);
    }
    for (const kind of ['exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
      const synced = await harness.rows('trip', kind, { trip_id: tripId });
      expect(synced.get('swipe_sessions') ?? [], kind).toHaveLength(0);
    }
  });

  it('is written by the server only and keeps one open session per trip', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query(
          "UPDATE swipe_sessions SET status = 'ended', ended_at = now() WHERE trip_id = $1",
          [tripId],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO swipe_sessions (trip_id, destination_id, started_by, match_rule)
           SELECT trip_id, destination_id, started_by, 2 FROM swipe_sessions WHERE trip_id = $1`,
          [tripId],
        ),
      ),
    ).rejects.toThrow(/swipe_sessions_one_open_per_trip/);
  });
});
