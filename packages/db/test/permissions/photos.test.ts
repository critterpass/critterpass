/**
 * `photos` (C1, RLS T): the trip's crew reads the album's photos (metadata only) and syncs them on
 * the trip stream; the outsider, the ex-member and an anonymous uid read nothing; only commands and
 * the worker write them. A traveller's own album settings (`album_prefs`, trip_me) and exports
 * (`album_exports`, me) are theirs alone.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { visibleRows } from '../helpers/setup-privacy';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe.each([
  ['album_prefs', 'trip_me'],
  ['album_exports', 'me'],
] as const)('%s', (table, stream) => {
  it('is read and synced by its owner only', async () => {
    const { tripId, actors } = harness.fixture;
    const probe = `SELECT 1 FROM ${table} WHERE trip_id = $1`;
    expect(await visibleRows(harness, actors.organiser, probe, [tripId])).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
    const params = { trip_id: tripId };
    expect(idsByTable(await harness.rows(stream, 'organiser', params))[table]).toHaveLength(1);
    expect(idsByTable(await harness.rows(stream, 'member', params))[table] ?? []).toEqual([]);
  });
});
