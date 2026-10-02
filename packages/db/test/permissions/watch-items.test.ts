/**
 * `watch_items` (C1, RLS T): the forecast watch list is crew-visible: every active member of the
 * trip's crew reads it and syncs it on the trip stream; the forecast watcher writes it as
 * app_system. The guide reads it through `llm.watch_items`, without the rule scores.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader } from '../../src/tx';
import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('watch_items', () => {
  it('is read by the crew only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'watch_items');
  });

  it('shows the guide the watch list of the trip in context only', async () => {
    const { actors, tripId } = harness.fixture;
    const rows = await withGuideReader(
      harness.db.pool,
      actors.member,
      tripId,
      async (tx) =>
        (
          await tx.query<Record<string, unknown>>(
            'SELECT * FROM llm.watch_items WHERE trip_id = $1',
            [tripId],
          )
        ).rows,
    );
    expect(rows.map((row) => row['status'])).toEqual(['watching']);
    for (const hidden of ['impact', 'score', 'disruption_id']) {
      expect(rows[0], hidden).not.toHaveProperty(hidden);
    }
    const outsider = await withGuideReader(
      harness.db.pool,
      actors.outsider,
      tripId,
      async (tx) =>
        (await tx.query('SELECT 1 FROM llm.watch_items WHERE trip_id = $1', [tripId])).rowCount,
    );
    expect(outsider).toBe(0);
  });
});
