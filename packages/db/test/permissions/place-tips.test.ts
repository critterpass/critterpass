/**
 * `place_tips`: an approved tip is open to every signed-in reader; a pending one is nobody's yet.
 * Tips are never synced. The author is kept for moderation only: app_user cannot select the
 * column, and no client writes a tip.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { STREAM_ACTORS, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let destinationId: string;
let poiId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { rows } = await harness.db.pool.query<{ poi_id: string; destination_id: string }>(
    'SELECT poi_id, destination_id FROM place_tips LIMIT 1',
  );
  poiId = rows[0]!.poi_id;
  destinationId = rows[0]!.destination_id;
  await withSystem(harness.db.pool, (tx) =>
    tx.query(
      "INSERT INTO place_tips (poi_id, author_id, text) VALUES ($1, $2, 'Still in review.')",
      [poiId, harness.fixture.actors.member],
    ),
  );
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('place_tips', () => {
  it('shows approved tips to every reader and hides pending ones', async () => {
    for (const kind of STREAM_ACTORS) {
      const uid = harness.fixture.actors[kind];
      expect(await visibleRows(harness, uid, 'SELECT id, text FROM place_tips'), kind).toBe(1);
      const synced = await harness.rows('explore', kind, { destination_id: destinationId });
      expect(synced.get('place_tips'), kind).toBeUndefined();
    }
  });

  it('never lets app_user read the author', async () => {
    await expect(
      withUser(harness.db.pool, harness.fixture.actors.member, randomUUID(), (tx) =>
        tx.query('SELECT author_id FROM place_tips'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('is written by the server only', async () => {
    await expect(
      withUser(harness.db.pool, harness.fixture.actors.member, randomUUID(), (tx) =>
        tx.query("INSERT INTO place_tips (poi_id, text) VALUES ($1, 'Mine.')", [poiId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
