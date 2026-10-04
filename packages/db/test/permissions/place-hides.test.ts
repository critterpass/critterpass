/**
 * `place_hides` (C2, RLS O): a hidden place is a passive signal, so its owner alone reads it and
 * syncs it on their own `me` stream. No crewmate, organiser, guide or trip stream ever sees it,
 * and nobody writes it through app_user (the hide and unhide commands write as the server).
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withUser } from '../../src/tx';
import { streamedTables, visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('place_hides', () => {
  it("is read by its owner only, never by a crewmate or the trip's organisers", async () => {
    const { actors } = harness.fixture;
    const probe = 'SELECT 1 FROM place_hides WHERE user_id = $1';
    expect(await visibleRows(harness, actors.organiser, probe, [actors.organiser])).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [actors.organiser]), kind).toBe(0);
    }
  });

  it('is written by nobody through app_user, not even its owner', async () => {
    const { actors } = harness.fixture;
    for (const sql of [
      'UPDATE place_hides SET created_at = now() WHERE user_id = $1',
      'DELETE FROM place_hides WHERE user_id = $1',
    ]) {
      await expect(
        withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
          tx.query(sql, [actors.organiser]),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('syncs on its owner me stream alone and rides no other stream', async () => {
    const { actors } = harness.fixture;
    const own = await harness.rows('me', 'organiser');
    expect(own.get('place_hides')?.map((row) => row['user_id'])).toEqual([actors.organiser]);
    for (const kind of ['member', 'coOrganiser', 'outsider'] as const) {
      expect((await harness.rows('me', kind)).get('place_hides') ?? [], kind).toEqual([]);
    }
    const streams = Object.keys(harness.config.streams).filter((name) =>
      harness.config.streams[name]?.queries.some((query) => /\bplace_hides\b/.test(query)),
    );
    expect(streams).toEqual(['me']);
    expect(streamedTables(harness).has('place_hides')).toBe(true);
  });

  it('never reaches the guide', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withGuideReader(harness.db.pool, actors.organiser, tripId, (tx) =>
        tx.query('SELECT 1 FROM place_hides'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
