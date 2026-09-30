/**
 * `proposal_versions` (C1, RLS T): a recipient reads only their own version, and only once the
 * proposal is sent; the trip's organisers read every version (PREVIEW AS). Peers never read each
 * other's.
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

const probe = 'SELECT recipient_id FROM proposal_versions WHERE trip_id = $1';

describe('proposal_versions', () => {
  it("lets a peer read only their own version, never another member's", async () => {
    const { actors, tripId } = harness.fixture;
    const { rows } = await harness.db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM proposal_versions WHERE trip_id = $1',
      [tripId],
    );
    expect(rows[0]!.n).toBe(2);
    expect(await visibleRows(harness, actors.member, probe, [tripId])).toBe(1);
    expect(
      await visibleRows(harness, actors.member, `${probe} AND recipient_id = $2`, [
        tripId,
        actors.coOrganiser,
      ]),
    ).toBe(0);
  });

  it('lets every organiser read every version and nobody outside the crew any', async () => {
    const { actors, tripId } = harness.fixture;
    expect(await visibleRows(harness, actors.organiser, probe, [tripId])).toBe(2);
    expect(await visibleRows(harness, actors.coOrganiser, probe, [tripId])).toBe(2);
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
  });

  it('syncs a recipient their own version and the organiser all of them', async () => {
    const { actors, tripId } = harness.fixture;
    const own = await harness.rows('trip_me', 'member', { trip_id: tripId });
    expect(own.get('proposal_versions')?.map((row) => row['recipient_id'])).toEqual([
      actors.member,
    ]);
    const all = await harness.rows('trip_draft', 'organiser', { trip_id: tripId });
    expect(all.get('proposal_versions')).toHaveLength(2);
    const peer = await harness.rows('trip_draft', 'member', { trip_id: tripId });
    expect(peer.get('proposal_versions') ?? []).toHaveLength(0);
    const outsider = await harness.rows('trip_me', 'outsider', { trip_id: tripId });
    expect(outsider.get('proposal_versions') ?? []).toHaveLength(0);
  });
});
