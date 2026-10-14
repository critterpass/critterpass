/**
 * Deletes every place-profile photo: the objects under `c/place-profiles/` in the media bucket
 * (images found by web search and re-hosted, with no licence we could check) and the photo lists
 * on `place_profiles`. Profiles keep their text. Run it from anywhere that reaches the database and
 * the bucket, first with `--dry-run`, which only counts:
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/places/profile/purge-photos-cli.ts [--dry-run]
 *
 * Re-runnable: a second run finds nothing left to delete.
 */
import { createPool, withSystem } from '@cp/db';
import type pg from 'pg';

import { createObjectStore, type ObjectStore } from '../../jobs/ops/object-store';

export const PROFILE_PHOTO_PREFIX = 'c/place-profiles/';
/** Deletes in flight at once: quick on R2 without tripping its request rate. */
const DELETE_BATCH = 16;

export interface PurgeCounts {
  readonly objects: number;
  readonly rows: number;
  readonly deleted: number;
  readonly cleared: number;
}

export async function purgeProfilePhotos(
  pool: pg.Pool,
  store: Pick<ObjectStore, 'list' | 'delete'>,
  options: { readonly dryRun: boolean; readonly log?: (line: string) => void },
): Promise<PurgeCounts> {
  const keys = await store.list(PROFILE_PHOTO_PREFIX);
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ n: string }>(
      "SELECT count(*) AS n FROM place_profiles WHERE photos IS NOT NULL AND photos <> '[]'::jsonb",
    ),
  );
  const withPhotos = Number(rows[0]?.n ?? 0);
  if (options.dryRun) return { objects: keys.length, rows: withPhotos, deleted: 0, cleared: 0 };

  // Rows first: once no row names a photo, no reader can offer one while the objects go.
  const cleared = await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE place_profiles SET photos = '[]'::jsonb, updated_at = now()
        WHERE photos IS NOT NULL AND photos <> '[]'::jsonb`,
    ),
  );
  let deleted = 0;
  for (let i = 0; i < keys.length; i += DELETE_BATCH) {
    await Promise.all(keys.slice(i, i + DELETE_BATCH).map((key) => store.delete(key)));
    deleted = Math.min(i + DELETE_BATCH, keys.length);
    if (deleted % 1_000 < DELETE_BATCH) options.log?.(`deleted ${deleted} of ${keys.length}`);
  }
  return { objects: keys.length, rows: withPhotos, deleted, cleared: cleared.rowCount ?? 0 };
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? required('DATABASE_URL');
  const pool = createPool({ connectionString, max: 1 });
  const store = createObjectStore({
    endpoint: required('R2_S3_ENDPOINT'),
    bucket: required('R2_BUCKET'),
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  });
  try {
    const counts = await purgeProfilePhotos(pool, store, { dryRun, log: console.log });
    console.log(
      `${dryRun ? 'dry run: ' : ''}${counts.objects} objects under ${PROFILE_PHOTO_PREFIX}, ` +
        `${counts.rows} profiles with photos; deleted ${counts.deleted}, cleared ${counts.cleared}`,
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('purge-photos-cli.ts') === true) await main();
