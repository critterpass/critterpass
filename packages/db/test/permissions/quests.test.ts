/**
 * `quests` (C1): the trip's quests sync with the trip to its crew; outsiders and ex-members see
 * none; only the server publishes, moves and completes them.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('quests', () => {
  it('lets the trip read its quests and nobody else', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM quests WHERE trip_id = $1';
    for (const kind of ['organiser', 'member', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(1);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
  });

  it('syncs on the trip stream to the trip only', async () => {
    const { tripId } = harness.fixture;
    const rows = (await harness.rows('trip', 'member', { trip_id: tripId })).get('quests') ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ template: 'log_expenses', status: 'active' });
    const outsider = await harness.rows('trip', 'outsider', { trip_id: tripId });
    expect(outsider.get('quests') ?? []).toEqual([]);
  });

  it('is never written by a traveller', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query(
          "UPDATE quests SET status = 'completed', completed_at = now() WHERE trip_id = $1",
          [tripId],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
