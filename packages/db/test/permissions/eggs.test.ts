/**
 * `eggs` (C1): a traveller reads their own egg whole (`me`); crewmates on the trip read its hatch
 * status (`trip`, id/user/granted/hatched columns only); outsiders and ex-members see none; only
 * the server grants and hatches, one egg per traveller per trip.
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

describe('eggs', () => {
  it('lets trip members read the eggs of the trip and nobody else', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM eggs WHERE trip_id = $1';
    for (const kind of ['organiser', 'member', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(2);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
  });

  it('syncs the own egg whole on me and crewmates only their hatch status on trip', async () => {
    const { tripId } = harness.fixture;
    const own = (await harness.rows('me', 'organiser')).get('eggs') ?? [];
    expect(own).toHaveLength(1);
    expect(own[0]).toHaveProperty('form_id');
    const trip = (await harness.rows('trip', 'organiser', { trip_id: tripId })).get('eggs') ?? [];
    expect(trip).toHaveLength(1);
    expect(Object.keys(trip[0]!).sort()).toEqual(
      ['granted_at', 'hatched_at', 'id', 'trip_id', 'user_id'].sort(),
    );
    expect((await harness.rows('trip', 'outsider', { trip_id: tripId })).get('eggs') ?? []).toEqual(
      [],
    );
  });

  it('is granted and hatched by the server only, once per traveller per trip', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query("UPDATE eggs SET hatched_at = now(), trigger = 'manual' WHERE user_id = $1", [
          actors.organiser,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO eggs (user_id, trip_id, form_id)
           SELECT user_id, trip_id, form_id FROM eggs WHERE user_id = $1 AND trip_id = $2`,
          [actors.organiser, tripId],
        ),
      ),
    ).rejects.toThrow(/eggs_user_trip_key/);
  });
});
