/**
 * `packing_items` (C1, RLS T with personal rows owner-only): a shared row is read by every active
 * member of the trip's crew and syncs on the trip stream; a personal row is its owner's alone and
 * syncs on their trip_me. Checking, adding and removing go through commands, never app_user writes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const personal = 'SELECT 1 FROM packing_items WHERE trip_id = $1 AND owner_id IS NOT NULL';

describe('packing_items', () => {
  it('keeps a personal row to its owner, directly and in sync', async () => {
    const { actors, tripId } = harness.fixture;
    expect(await visibleRows(harness, actors.organiser, personal, [tripId])).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], personal, [tripId]), kind).toBe(0);
      const mine = await harness.rows('trip_me', kind, { trip_id: tripId });
      expect(mine.get('packing_items') ?? [], kind).toHaveLength(0);
    }
    const crew = await harness.rows('trip', 'member', { trip_id: tripId });
    expect(crew.get('packing_items')?.every((row) => row['owner_id'] === null)).toBe(true);
    const own = await harness.rows('trip_me', 'organiser', { trip_id: tripId });
    expect(own.get('packing_items')?.map((row) => row['label'])).toEqual(['Contact lenses']);
  });
});
