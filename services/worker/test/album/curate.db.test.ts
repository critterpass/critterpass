/**
 * Album curation against a migrated Postgres, R2 kept in memory: from 40 photos the job picks 24,
 * everyone tagged in three where the album has them, a traveller's own pick kept and the photo
 * they took out left out, blurry photos and near-duplicates skipped; the note never says everyone
 * is in unless they are; the guide's scores (a gateway double standing for DeepSeek) decide among
 * the rest, invented ids ignored; a second run replaces only the guide's own picks.
 */
import { randomUUID } from 'node:crypto';

import type { Gateway } from '@cp/ai';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { curateAlbum } from '../../src/jobs/album/curate';
import type { AlbumMediaStore } from '../../src/jobs/album/process-photo';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let tripId: string;
const people = { ana: randomUUID(), ben: randomUUID(), cy: randomUUID() };
const photos: string[] = [];
const objects = new Map<string, Uint8Array>();
const store: Pick<AlbumMediaStore, 'get'> = {
  get: (key) => {
    const bytes = objects.get(key);
    return Promise.resolve(bytes === undefined ? null : { bytes, contentType: 'image/jpeg' });
  },
};

async function q<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, [...params])).rows as T[]);
}

beforeAll(async () => {
  harness = await startJobsHarness();
  for (const [name, uid] of Object.entries(people)) {
    await q("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)", [
      uid,
      name,
    ]);
  }
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Album', $1) RETURNING id",
    [people.ana],
  );
  const [trip] = await q<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crew!.id],
  );
  tripId = trip!.id;
  for (let i = 0; i < 40; i += 1) {
    const id = randomUUID();
    const thumb = `u/${people.ana}/photo/${randomUUID()}`;
    objects.set(thumb, new Uint8Array([0xff, 0xd8, i]));
    const quality =
      i === 0
        ? { blur: 10 }
        : i === 1 || i === 2
          ? { blur: 300, dup_cluster: 'pair' }
          : { blur: 300 };
    await q(
      `INSERT INTO photos (id, trip_id, uploader_id, media_key, thumb_key, sha256, local_date,
         quality, upload_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processed')`,
      [
        id,
        tripId,
        people.ana,
        `u/${people.ana}/photo/${randomUUID()}`,
        thumb,
        String(i).padStart(64, '0'),
        `2026-10-0${2 + (i % 3)}`,
        JSON.stringify(quality),
      ],
    );
    photos.push(id);
  }
  // Ben is in five photos, Cy in two; Ana took photo 38 out and picked photo 39 herself.
  for (const [i, uid] of [
    [10, people.ben],
    [11, people.ben],
    [12, people.ben],
    [13, people.ben],
    [14, people.ben],
    [20, people.cy],
    [21, people.cy],
  ] as const) {
    await q(
      "INSERT INTO photo_people (photo_id, trip_id, user_id, source) VALUES ($1, $2, $3, 'manual')",
      [photos[i], tripId, uid],
    );
  }
  for (const [i, picked] of [
    [38, false],
    [39, true],
  ] as const) {
    await q(
      `INSERT INTO album_picks (trip_id, photo_id, picked, picked_by, picker_id)
       VALUES ($1, $2, $3, 'user', $4)`,
      [tripId, photos[i], picked, people.ana],
    );
  }
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

async function picked(): Promise<string[]> {
  const rows = await q<{ photo_id: string }>(
    'SELECT photo_id FROM album_picks WHERE trip_id = $1 AND picked ORDER BY photo_id',
    [tripId],
  );
  return rows.map((row) => row.photo_id);
}

describe('ai.curate_album', { timeout: 60_000 }, () => {
  it('picks 24 with everyone tagged in three where they can be, and an honest note', async () => {
    expect(await curateAlbum(harness.pool, store, undefined, tripId)).toEqual({
      outcome: 'curated',
      picks: 24,
      scored: 0,
      note_fallback: true,
    });
    const picks = await picked();
    expect(picks).toHaveLength(24);
    expect(picks).toContain(photos[39]);
    expect(picks).not.toContain(photos[38]);
    expect(picks).not.toContain(photos[0]);
    expect([photos[1], photos[2]].filter((p) => picks.includes(p!))).toHaveLength(1);
    expect([10, 11, 12, 13, 14].filter((i) => picks.includes(photos[i]!))).toHaveLength(3);
    expect([20, 21].filter((i) => picks.includes(photos[i]!))).toHaveLength(2);
    const [curation] = await q<{ note: string; picks: number; photos: number }>(
      'SELECT note, picks, photos FROM album_curations WHERE trip_id = $1',
      [tripId],
    );
    // Cy is in only two photos, so not everyone is in three.
    expect(curation).toEqual({
      note: 'I picked 24 keepers. Nothing blurry.',
      picks: 24,
      photos: 40,
    });
    const flagged = await q<{ n: number }>(
      'SELECT count(*)::int AS n FROM photos WHERE trip_id = $1 AND is_pick',
      [tripId],
    );
    expect(flagged[0]!.n).toBe(24);
    const { rows } = await harness.pool.query<{ type: string }>(
      "SELECT payload->>'type' AS type FROM rt_outbox WHERE channel = $1",
      [`trip_album:${tripId}`],
    );
    expect(rows.map((r) => r.type)).toEqual(['curation.done']);
  });

  it("lets the guide's scores choose among the rest, and keeps the travellers' own picks", async () => {
    const favourites = photos.slice(25, 37);
    const calls: string[] = [];
    const gateway: Pick<Gateway, 'callModel'> = {
      callModel: (route) => {
        calls.push(route);
        const text =
          route === 'photo.picks'
            ? JSON.stringify({
                scores: [
                  ...photos.map((id) => ({ photo_id: id, score: favourites.includes(id) ? 9 : 3 })),
                  { photo_id: randomUUID(), score: 10 },
                ],
              })
            : "Everyone's in at least three. 24 keepers.";
        return Promise.resolve({ message: { content: [{ type: 'text', text }] } }) as never;
      },
    };
    const outcome = await curateAlbum(harness.pool, store, () => gateway, tripId);
    expect(outcome).toMatchObject({ outcome: 'curated', picks: 24, note_fallback: true });
    expect(calls).toEqual(['photo.picks', 'micro.line']);
    const picks = await picked();
    expect(favourites.every((id) => picks.includes(id))).toBe(true);
    expect(picks).toContain(photos[39]);
    expect(picks).not.toContain(photos[38]);
    const users = await q('SELECT photo_id FROM album_picks WHERE picked_by = $1 ORDER BY 1', [
      'user',
    ]);
    expect(users).toHaveLength(2);
  });
});
