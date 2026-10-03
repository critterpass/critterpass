/**
 * Album commands through the real `/v1/cmd` door against a migrated Postgres: an uploaded photo
 * registers once (a replay and the same bytes under another id answer the first), becomes readable
 * to the crew and nobody else, and queues its processing; only a traveller registers, and only
 * their own upload; picks override the guide and glint live; only the uploader or an organiser
 * deletes; self tags, the auto-ingest switch and "download all" land for the caller.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerAlbumCommands } from '../../src/commands/album';
import { startJobProducer } from '../../src/jobs/producer';
import { authorizeReads } from '../../src/media/read-access';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let producer: PgBoss;
let anna: SignedIn;
let ben: SignedIn;
let declined: SignedIn;
let outsider: SignedIn;
let tripId: string;

const SHA = 'd'.repeat(64);

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function upload(owner: SignedIn): Promise<string> {
  const key = `u/${owner.uid}/photo/${generateUuidV7()}`;
  await q(
    `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose)
     VALUES ($1, $2, 'image/jpeg', 1024, $3, 'photo')`,
    [owner.uid, key, SHA],
  );
  return key;
}

async function jobs(name: string): Promise<unknown[]> {
  const { rows } = await harness.pool.query<{ data: unknown }>(
    'SELECT data FROM pgboss.job WHERE name = $1 ORDER BY created_on',
    [name],
  );
  return rows.map((row) => row.data);
}

beforeAll(async () => {
  harness = await startCommandDoors(registerAlbumCommands);
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  [anna, ben, declined, outsider] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Album', $1) RETURNING id",
    [anna.uid],
  );
  const [trip] = await q<{ id: string }>(
    `INSERT INTO trips (crew_id, status, tz) VALUES ($1, 'voting', 'Asia/Ho_Chi_Minh') RETURNING id`,
    [crew!.id],
  );
  tripId = trip!.id;
  for (const [person, role, rsvp] of [
    [anna, 'organiser', 'in'],
    [ben, 'member', 'in'],
    [declined, 'member', 'out'],
  ] as const) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crew!.id,
      person.uid,
      role,
    ]);
    await q(
      'INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, $4)',
      [tripId, person.uid, role, rsvp],
    );
  }
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await harness?.stop();
});

const register = (person: SignedIn, photoId: string, key: string, opId?: string) =>
  runCommand(
    harness,
    person,
    'register_photo',
    {
      photo_id: photoId,
      trip_id: tripId,
      media_key: key,
      sha256: SHA,
      taken_at: '2026-10-02T21:30:00Z',
      quality: { blur: 210, face_count: 3 },
      exif_gps_stripped: true,
    },
    opId === undefined ? {} : { opId },
  );

let photoId: string;

describe('register_photo', () => {
  it('registers an upload once, for the crew to read, and queues its processing', async () => {
    photoId = randomUUID();
    const key = await upload(ben);
    const opId = generateUuidV7();
    const first = await register(ben, photoId, key, opId);
    expect(first.body).toMatchObject({ result: { photo_id: photoId, duplicate_of: null } });
    expect((await register(ben, photoId, key, opId)).body).toMatchObject({ status: 'duplicate' });
    const again = await register(anna, randomUUID(), await upload(anna));
    expect(again.body).toMatchObject({ result: { duplicate_of: photoId } });

    expect(
      await q('SELECT uploader_id, local_date::text AS local_date FROM photos WHERE trip_id = $1', [
        tripId,
      ]),
    ).toEqual([{ uploader_id: ben.uid, local_date: '2026-10-03' }]);
    expect(await jobs('album.process_photo')).toEqual([{ photo_id: photoId }]);
    const added = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'photo.added' AND trip_id = $1",
      [tripId],
    );
    expect(added.rowCount).toBe(1);

    expect(await authorizeReads(harness.pool, anna.uid, [key])).toBe(true);
    expect(await authorizeReads(harness.pool, outsider.uid, [key])).toBe(false);
  });

  it('is only for a traveller, and only with their own upload', async () => {
    const declinedKey = await upload(declined);
    expect((await register(declined, randomUUID(), declinedKey)).status).toBe(404);
    const foreign = await upload(ben);
    expect((await register(anna, randomUUID(), foreign)).status).toBe(404);
  });
});

describe('set_album_pick', () => {
  it('overrides the guide and glints live', async () => {
    await q(
      `INSERT INTO album_picks (trip_id, photo_id, picked_by, rank) VALUES ($1, $2, 'guide', 1)`,
      [tripId, photoId],
    );
    await q('UPDATE photos SET is_pick = true WHERE id = $1', [photoId]);
    const result = await runCommand(harness, anna, 'set_album_pick', {
      photo_id: photoId,
      picked: false,
    });
    expect(result.status).toBe(200);
    expect(
      await q('SELECT picked, picked_by, picker_id FROM album_picks WHERE photo_id = $1', [
        photoId,
      ]),
    ).toEqual([{ picked: false, picked_by: 'user', picker_id: anna.uid }]);
    expect(await q('SELECT is_pick FROM photos WHERE id = $1', [photoId])).toEqual([
      { is_pick: false },
    ]);
    const { rows } = await harness.pool.query<{ type: string }>(
      "SELECT payload->>'type' AS type FROM rt_outbox WHERE channel = $1",
      [`trip_album:${tripId}`],
    );
    expect(rows.map((r) => r.type)).toEqual(['photo.picked']);
  });
});

describe('tag_self_in_photo, set_album_auto_ingest, request_album_export', () => {
  it('land for the caller alone', async () => {
    await runCommand(harness, anna, 'tag_self_in_photo', { photo_id: photoId, on: true });
    await runCommand(harness, ben, 'tag_self_in_photo', { photo_id: photoId, on: true });
    await runCommand(harness, ben, 'tag_self_in_photo', { photo_id: photoId, on: false });
    expect(
      await q('SELECT user_id, source FROM photo_people WHERE photo_id = $1', [photoId]),
    ).toEqual([{ user_id: anna.uid, source: 'manual' }]);
    await runCommand(harness, ben, 'set_album_auto_ingest', { trip_id: tripId, on: true });
    expect(
      await q('SELECT user_id, auto_ingest FROM album_prefs WHERE trip_id = $1', [tripId]),
    ).toEqual([{ user_id: ben.uid, auto_ingest: true }]);
    const exportId = randomUUID();
    const exported = await runCommand(harness, ben, 'request_album_export', {
      trip_id: tripId,
      export_id: exportId,
    });
    expect(exported.body).toMatchObject({ result: { export_id: exportId, status: 'queued' } });
    expect(await jobs('album.export')).toEqual([{ export_id: exportId }]);
    expect(
      (
        await runCommand(harness, outsider, 'request_album_export', {
          trip_id: tripId,
          export_id: randomUUID(),
        })
      ).status,
    ).toBe(404);
  });
});

describe('delete_photo', () => {
  it('is for the uploader or an organiser, and takes picks and tags with it', async () => {
    const other = randomUUID();
    await q(
      `INSERT INTO photos (id, trip_id, uploader_id, media_key, sha256)
       VALUES ($1, $2, $3, $4, repeat('e', 64))`,
      [other, tripId, anna.uid, `u/${anna.uid}/photo/${generateUuidV7()}`],
    );
    expect((await runCommand(harness, ben, 'delete_photo', { photo_id: other })).status).toBe(403);
    expect((await runCommand(harness, anna, 'delete_photo', { photo_id: photoId })).status).toBe(
      200,
    );
    expect(
      await q('SELECT deleted_at IS NOT NULL AS gone FROM photos WHERE id = $1', [photoId]),
    ).toEqual([{ gone: true }]);
    expect(await q('SELECT 1 FROM album_picks WHERE photo_id = $1', [photoId])).toEqual([]);
    expect(await q('SELECT 1 FROM photo_people WHERE photo_id = $1', [photoId])).toEqual([]);
  });
});
