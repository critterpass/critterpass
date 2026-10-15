/**
 * The places prune on real Postgres: a dry run only counts; a real run dumps `pois` first (once a
 * day) and then deletes, in batches, the rows that fail the lean rule or belong to a destination
 * nobody uses, keeping every referenced and every editorial row. A curated destination (a loaded
 * itinerary, or a place with a curated note) is in use. pg_dump and the bucket are the
 * boundary: a stand-in command writes the dump into an in-memory store.
 */
import { placesPruneJobSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ObjectStore } from '../../src/jobs/ops/object-store';
import { prunePlaces, PRUNE_DUMP_PREFIX, type PruneDump } from '../../src/places/prune';
import { silent, startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
const ids: Record<string, string> = {};

function memoryStore(): ObjectStore & { readonly puts: string[] } {
  const objects = new Map<string, Uint8Array>();
  const puts: string[] = [];
  return {
    puts,
    async putStream(key, body) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of body) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      objects.set(key, bytes);
      puts.push(key);
      return bytes.length;
    },
    list: (prefix) => Promise.resolve([...objects.keys()].filter((key) => key.startsWith(prefix))),
    get: (key) => Promise.resolve(objects.get(key) ?? new Uint8Array()),
    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };
}

async function destination(slug: string): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz) VALUES ($1, $1, 'guest', 'UTC') RETURNING id`,
    [slug],
  );
  return rows[0]!.id;
}

async function place(
  key: string,
  destinationId: string,
  category: string,
  curation: 'auto' | 'editorial' = 'auto',
  editorial: object = {},
): Promise<void> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO pois
       (destination_id, name, category, lat, lng, source_ids, confidence, curation, editorial)
     VALUES ($1, $2, $3, 16.0, 108.2, jsonb_build_object('overture', $2::text), 0.9, $4, $5)
     RETURNING id`,
    [destinationId, key, category, curation, JSON.stringify(editorial)],
  );
  ids[key] = rows[0]!.id;
}

async function remaining(): Promise<string[]> {
  const { rows } = await harness.pool.query<{ name: string }>(
    'SELECT name FROM pois WHERE id = ANY($1::uuid[]) ORDER BY name',
    [Object.values(ids)],
  );
  return rows.map((row) => row.name);
}

beforeAll(async () => {
  harness = await startJobsHarness();
  const used = await destination('prune-used');
  const unused = await destination('prune-unused');
  const curated = await destination('prune-curated');
  const itinerary = await destination('prune-itinerary');
  const user = await harness.pool.query<{ id: string }>(
    "INSERT INTO users (id, status) VALUES (uuidv7(), 'registered') RETURNING id",
  );
  const crew = await harness.pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Crew', $1) RETURNING id",
    [user.rows[0]!.id],
  );
  await harness.pool.query(
    "INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'setup', $2)",
    [crew.rows[0]!.id, used],
  );

  await place('used-food', used, 'food');
  await place('used-mall', used, 'shopping');
  await place('used-mall-profiled', used, 'shopping');
  await place('used-mall-editorial', used, 'shopping', 'editorial');
  for (let i = 0; i < 5; i += 1) await place(`unused-food-${i}`, unused, 'food');
  await place('unused-food-saved', unused, 'food');
  await place('curated-sight', curated, 'museum', 'editorial', { curated: { rank: 1 } });
  await place('curated-food', curated, 'food');
  await place('curated-mall', curated, 'shopping');
  await harness.pool.query(
    'INSERT INTO destination_itineraries (destination_id, ideal_days_min, ideal_days_max) VALUES ($1, 2, 3)',
    [itinerary],
  );
  await place('itinerary-food', itinerary, 'food');

  await harness.pool.query("INSERT INTO place_profiles (poi_id, status) VALUES ($1, 'pending')", [
    ids['used-mall-profiled'],
  ]);
  await harness.pool.query(
    "INSERT INTO saved_items (user_id, kind, ref_id) VALUES ($1, 'place', $2)",
    [user.rows[0]!.id, ids['unused-food-saved']],
  );
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

const KEPT = [
  'curated-food',
  'curated-sight',
  'itinerary-food',
  'unused-food-saved',
  'used-food',
  'used-mall-editorial',
  'used-mall-profiled',
];

describe('the places prune', { timeout: 120_000 }, () => {
  it('runs dry unless told otherwise', () => {
    expect(placesPruneJobSchema.parse(undefined)?.dry_run ?? true).toBe(true);
    expect(placesPruneJobSchema.parse({})?.dry_run).toBe(true);
    expect(placesPruneJobSchema.parse({ dry_run: false })?.dry_run).toBe(false);
  });

  it('only counts in a dry run', async () => {
    const result = await prunePlaces(harness.pool, { dryRun: true, logger: silent });
    expect(result).toMatchObject({ dryRun: true, dumpKey: null, after: null });
    expect(result.deleted).toBeGreaterThanOrEqual(6);
    expect(result.keptCandidates).toBeGreaterThanOrEqual(2);
    expect(result.usedDestinations).toBeGreaterThanOrEqual(3);
    expect(await remaining()).toHaveLength(Object.keys(ids).length);
  });

  it('refuses to delete without somewhere to put the dump', async () => {
    await expect(prunePlaces(harness.pool, { dryRun: false, logger: silent })).rejects.toThrow(
      /dump/,
    );
  });

  it('dumps once, then deletes everything outside the lean index and the kept set', async () => {
    const store = memoryStore();
    const dump: PruneDump = {
      databaseUrl: harness.postgres.getConnectionUri(),
      store,
      pgDump: [process.execPath, '-e', 'process.stdout.write("pois dump")', '--'],
    };
    const now = new Date('2026-10-14T09:00:00Z');
    const options = { dryRun: false, logger: silent, dump, batchSize: 2, pauseMs: 0, now };
    const result = await prunePlaces(harness.pool, options);
    expect(result.dumpKey).toBe(`${PRUNE_DUMP_PREFIX}2026-10-14.dump`);
    expect(store.puts).toEqual([`${PRUNE_DUMP_PREFIX}2026-10-14.dump`]);
    expect(await remaining()).toEqual(KEPT);
    expect(result.deleted).toBeGreaterThanOrEqual(6);
    expect(result.after?.rows).toBe(result.before.rows - result.deleted);

    // A second run the same day keeps the first dump and finds nothing more to delete.
    const again = await prunePlaces(harness.pool, options);
    expect(store.puts).toHaveLength(1);
    expect(again.deleted).toBe(0);
    expect(await remaining()).toEqual(KEPT);
  });
});
