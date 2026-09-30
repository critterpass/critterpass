import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computePublicationAllowList } from '../../src/publication';
import { withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;

const VARIANTS = JSON.stringify([
  { key: 'c/media/x/828.webp', format: 'webp', w: 828, h: 552, bytes: 1 },
]);

async function insertAsset(sourceId: string, status: 'pending' | 'ready'): Promise<string> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO media_assets (kind, source, source_id, source_url, download_url, subject_keys,
         author, licence, licence_url, attribution_required, credit, blurhash, variants, status)
       VALUES ('photo', 'pexels', $1, 'https://www.pexels.com/photo/1/', 'https://images.pexels.com/1.jpeg',
         '{destination:da-nang}', 'Someone', 'pexels', 'https://www.pexels.com/license/', false,
         'Photo: Someone · Pexels', $2, $3, $4)
       RETURNING id`,
      [
        sourceId,
        status === 'ready' ? 'LEHV6nWB2yk8' : null,
        status === 'ready' ? VARIANTS : '[]',
        status,
      ],
    );
    return rows[0]!.id;
  });
}

const asReader = <T>(fn: Parameters<typeof withUser<T>>[3]) =>
  withUser(db.pool, anonymousActor().uid, anonymousActor().device, fn);

let readyId: string;
let pendingId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  readyId = await insertAsset('ready-1', 'ready');
  pendingId = await insertAsset('pending-1', 'pending');
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('media_assets RLS: editorial media (class C0, read-ready, not synced)', () => {
  it('lets any signed-in reader see ready assets and never pending ones', async () => {
    const { rows } = await asReader((tx) =>
      tx.query<{ id: string }>('SELECT id FROM media_assets WHERE id = ANY($1)', [
        [readyId, pendingId],
      ]),
    );
    expect(rows.map((row) => row.id)).toEqual([readyId]);
  });

  it('rejects every app_user write', async () => {
    await expect(
      asReader((tx) => tx.query("UPDATE media_assets SET credit = 'x' WHERE id = $1", [readyId])),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asReader((tx) => tx.query('DELETE FROM media_assets WHERE id = $1', [readyId])),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses a ready asset without files or a blurhash', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query("UPDATE media_assets SET status = 'ready' WHERE id = $1", [pendingId]),
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it('refuses a malformed subject key', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query("UPDATE media_assets SET subject_keys = '{Da Nang}' WHERE id = $1", [pendingId]),
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it('keeps one row per source file', async () => {
    await expect(insertAsset('ready-1', 'pending')).rejects.toThrow(/duplicate key/i);
  });

  it('is excluded from the powersync publication despite its C0 privacy class', () => {
    expect(computePublicationAllowList()).not.toContain('media_assets');
  });
});
