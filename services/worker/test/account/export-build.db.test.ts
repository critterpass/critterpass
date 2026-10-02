/**
 * `export.build` against a real migrated Postgres, with two crewmates: the requester's zip holds
 * their own profile, past trips, messages and uploads, and nothing of their crewmate's (no profile,
 * no taste, no messages, no uploads), while the crewmate's own rows stay untouched. The row is
 * ready for seven days, the owner is told, and the sweep retires it after that and deletes the zip.
 * The media bucket (R2) is the network boundary, held in memory here.
 */
import { randomUUID } from 'node:crypto';

import { exportObjectKey } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildExport, expireExports } from '../../src/jobs/account/export-build';
import { readStoredZip } from '../../src/jobs/account/zip';
import type { AvatarMediaStore, StoredObject } from '../../src/jobs/avatar/media-store';
import { silent, startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
const q = (sql: string, params: unknown[] = []) => harness.pool.query(sql, params);

function memoryStore(): AvatarMediaStore & { readonly objects: Map<string, StoredObject> } {
  const objects = new Map<string, StoredObject>();
  return {
    objects,
    get: (key) => Promise.resolve(objects.get(key) ?? null),
    put: (key, bytes, contentType) => {
      objects.set(key, { bytes, contentType });
      return Promise.resolve();
    },
    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };
}

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness.close();
});

async function person(name: string): Promise<string> {
  const uid = randomUUID();
  await q("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)", [
    uid,
    name,
  ]);
  await q('INSERT INTO user_settings (user_id) VALUES ($1)', [uid]);
  await q('INSERT INTO taste_profiles (user_id, tags) VALUES ($1, $2)', [uid, [`${name}-tag`]]);
  return uid;
}

async function upload(uid: string, store: ReturnType<typeof memoryStore>, body: string) {
  const key = `u/${uid}/chat/${randomUUID()}`;
  await q(
    `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose)
     VALUES ($1, $2, 'photo', $3, 'x', 'chat')`,
    [uid, key, body.length],
  );
  store.objects.set(key, { bytes: new TextEncoder().encode(body), contentType: 'image/jpeg' });
  return key;
}

describe('export.build', () => {
  it("zips only the requester's own data, never a crewmate's", async () => {
    const store = memoryStore();
    const me = await person('Khanh');
    const mate = await person('Maya');
    const crew = (
      await q("INSERT INTO crews (name, created_by) VALUES ('Bali six', $1) RETURNING id", [me])
    ).rows[0] as { id: string };
    await q('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2), ($1, $3)', [
      crew.id,
      me,
      mate,
    ]);
    await q(
      `INSERT INTO messages (crew_id, sender_kind, sender_id, type, body)
       VALUES ($1, 'user', $2, 'text', 'mine: see you at the gate'),
              ($1, 'user', $3, 'text', 'theirs: running late')`,
      [crew.id, me, mate],
    );
    await q(
      "INSERT INTO past_trips (id, user_id, country, month) VALUES ($1, $2, 'PT', '2019-06-01')",
      [randomUUID(), me],
    );
    await upload(me, store, 'MY-PHOTO');
    await upload(mate, store, 'THEIR-PHOTO');
    const exportId = randomUUID();
    await q("INSERT INTO data_exports (id, user_id, status) VALUES ($1, $2, 'queued')", [
      exportId,
      me,
    ]);

    const now = new Date('2026-10-03T09:00:00Z');
    const errors: string[] = [];
    const logger = {
      ...silent,
      error: (fields: object) => void errors.push(String((fields as { err?: unknown }).err)),
    };
    const outcome = await buildExport(harness.pool, store, exportId, logger, () => now);
    expect(outcome, errors.join('\n')).toBe('ready');

    const zip = store.objects.get(exportObjectKey(me, exportId));
    expect(zip?.contentType).toBe('application/zip');
    const files = new Map(
      readStoredZip(zip?.bytes ?? new Uint8Array()).map((entry) => [
        entry.name,
        new TextDecoder().decode(entry.bytes),
      ]),
    );
    const everything = [...files.values()].join('\n');
    expect(files.get('profile/profile.json')).toContain('Khanh');
    expect(files.get('profile/taste.json')).toContain('Khanh-tag');
    expect(files.get('profile/past-trips.json')).toContain('"PT"');
    expect(files.get('chat/messages.json')).toContain('mine: see you at the gate');
    expect([...files.values()]).toContain('MY-PHOTO');
    // Nothing of the crewmate: not their name, taste, messages or uploads.
    expect(everything).not.toContain('Maya');
    expect(everything).not.toContain('running late');
    expect(everything).not.toContain('THEIR-PHOTO');
    expect(everything).not.toContain(mate);

    const row = (
      await q('SELECT status, r2_key, expires_at, bytes FROM data_exports WHERE id = $1', [
        exportId,
      ])
    ).rows[0] as { status: string; r2_key: string; expires_at: Date; bytes: string };
    expect(row.status).toBe('ready');
    expect(row.expires_at.toISOString()).toBe('2026-10-10T09:00:00.000Z');
    expect(Number(row.bytes)).toBe(zip?.bytes.length);
    const told = await q(
      "SELECT 1 FROM domain_events WHERE type = 'data_export.ready' AND aggregate_id = $1",
      [me],
    );
    expect(told.rowCount).toBe(1);
    // The crewmate's own rows are as they were.
    const theirs = await q('SELECT 1 FROM messages WHERE sender_id = $1', [mate]);
    expect(theirs.rowCount).toBe(1);

    // Seven days on, the sweep retires it and deletes the zip.
    expect(await expireExports(harness.pool, store, new Date('2026-10-10T09:00:01Z'))).toBe(1);
    const expired = (await q('SELECT status FROM data_exports WHERE id = $1', [exportId]))
      .rows[0] as { status: string };
    expect(expired.status).toBe('expired');
    expect(store.objects.has(exportObjectKey(me, exportId))).toBe(false);
  });

  it('fails cleanly without a bucket, and never builds a finished export twice', async () => {
    const me = await person('Lan');
    const exportId = randomUUID();
    await q("INSERT INTO data_exports (id, user_id, status) VALUES ($1, $2, 'queued')", [
      exportId,
      me,
    ]);
    expect(await buildExport(harness.pool, null, exportId, silent)).toBe('failed');
    const row = (await q('SELECT status, error_code FROM data_exports WHERE id = $1', [exportId]))
      .rows[0] as { status: string; error_code: string };
    expect(row).toEqual({ status: 'failed', error_code: 'storage_unavailable' });
    expect(await buildExport(harness.pool, memoryStore(), exportId, silent)).toBe('skipped');
  });
});
