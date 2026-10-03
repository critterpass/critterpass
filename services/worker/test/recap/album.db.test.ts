/**
 * The recap's album side against the fixture trip (./recap-world.ts): the album contributor counts
 * the trip's live photos and who took the most, hands the human-camera award its numbers and adds
 * the photos to the best day; the year-later memory shows the album's best pick from that day.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ensureTripMemory } from '../../src/jobs/anniversary/build-memory';
import { straightLineRouter } from '../../src/jobs/live-map/meetup-router';
import { buildRecap } from '../../src/jobs/recap/build';
import { startRecapWorld, type RecapWorld, type Name } from './recap-world';

let world: RecapWorld;
let highlight: string;

async function addPhoto(by: Name, takenAt: string, deleted = false): Promise<string> {
  const id = randomUUID();
  const display = `u/${world.users[by]}/photo/${randomUUID()}`;
  await world.q(
    `INSERT INTO photos (id, trip_id, uploader_id, media_key, display_key, sha256, taken_at,
       local_date, upload_state, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, ($7::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
       'processed', $8)`,
    [
      id,
      world.tripId,
      world.users[by],
      `u/${world.users[by]}/photo/${randomUUID()}`,
      display,
      id.replace(/-/gu, '').padEnd(64, '0'),
      takenAt,
      deleted ? new Date() : null,
    ],
  );
  return id;
}

beforeAll(async () => {
  world = await startRecapWorld();
  await addPhoto('anna', '2026-10-02T03:00:00Z');
  await addPhoto('anna', '2026-10-03T02:00:00Z');
  await addPhoto('dev', '2026-10-03T03:00:00Z');
  const best = await addPhoto('dev', '2026-10-03T04:00:00Z');
  await addPhoto('dev', '2026-10-04T02:00:00Z');
  await addPhoto('dev', '2026-10-04T05:00:00Z', true);
  await addPhoto('ben', '2026-09-20T05:00:00Z');
  await world.q(
    `INSERT INTO album_picks (trip_id, photo_id, picked_by, rank) VALUES ($1, $2, 'guide', 1)`,
    [world.tripId, best],
  );
  const [row] = await world.q<{ display_key: string }>(
    'SELECT display_key FROM photos WHERE id = $1',
    [best],
  );
  highlight = row!.display_key;
  await buildRecap(
    world.harness.pool,
    { trip_id: world.tripId, reason: 'trip_ended', ended_on: '2026-10-04' },
    { router: straightLineRouter },
  );
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('the recap from the album', { timeout: 60_000 }, () => {
  it("counts the trip's live photos and who took the most, for the stats and the awards", async () => {
    const [recap] = await world.q<{ stats: { photos: unknown; best_day: { score: number } } }>(
      'SELECT stats FROM recaps WHERE trip_id = $1',
      [world.tripId],
    );
    expect(recap!.stats.photos).toEqual({
      count: 5,
      top_uploader: { user_id: world.users.dev, count: 3 },
    });
    expect(recap!.stats.best_day).toMatchObject({ local_date: '2026-10-03', score: 10 });
    const [dev] = await world.q<{ kind: string; value: number }>(
      'SELECT kind, value FROM recap_awards WHERE trip_id = $1 AND user_id = $2',
      [world.tripId, world.users.dev],
    );
    expect(dev).toEqual({ kind: 'human_camera', value: 3 });
  });

  it("shows the album's best pick from the best day on the year-later memory", async () => {
    const [recap] = await world.q<{ id: string }>('SELECT id FROM recaps WHERE trip_id = $1', [
      world.tripId,
    ]);
    const memory = await withSystem(world.harness.pool, (tx) => ensureTripMemory(tx, recap!.id));
    const [row] = await world.q<{ photo_media_key: string }>(
      'SELECT photo_media_key FROM memories WHERE id = $1',
      [memory!.id],
    );
    expect(row!.photo_media_key).toBe(highlight);
  });
});
