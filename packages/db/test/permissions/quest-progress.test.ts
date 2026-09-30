/**
 * `quest_progress` (C1): the trip reads each quest's progress; only the evaluator writes it.
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

describe('quest_progress', () => {
  it('lets the trip read progress and syncs it on the trip stream only', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM quest_progress WHERE trip_id = $1';
    for (const kind of ['organiser', 'member', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(1);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
    const member = await harness.rows('trip', 'member', { trip_id: tripId });
    expect(member.get('quest_progress')?.map((row) => row['value'])).toEqual([1]);
    const outsider = await harness.rows('trip', 'outsider', { trip_id: tripId });
    expect(outsider.get('quest_progress') ?? []).toEqual([]);
  });

  it('is never moved by a traveller', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query('UPDATE quest_progress SET value = 99 WHERE trip_id = $1', [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
