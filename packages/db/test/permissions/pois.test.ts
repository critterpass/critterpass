import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computePublicationAllowList } from '../../src/publication';
import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let destinationId: string;

async function insertPoi(overrides: { name?: string; sourceIds?: object } = {}): Promise<string> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids)
       VALUES ($1, $2, 'temple_shrine', 35.0, 135.0, $3::jsonb)
       RETURNING id`,
      [destinationId, overrides.name ?? 'Fushimi Inari', JSON.stringify(overrides.sourceIds ?? {})],
    );
    return firstRow(rows).id;
  });
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  destinationId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, coverage) VALUES ('kyoto', 'Kyoto', 'live') RETURNING id",
    );
    return firstRow(rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('pois RLS: catalogue (class C0, read-all)', () => {
  it('is readable by any authenticated app_user, with no crew or trip needed', async () => {
    const poiId = await insertPoi();
    const rows = await withUser(
      db.pool,
      anonymousActor().uid,
      anonymousActor().device,
      async (tx) => {
        const { rows } = await tx.query<{ name: string }>('SELECT name FROM pois WHERE id = $1', [
          poiId,
        ]);
        return rows;
      },
    );
    expect(rows).toEqual([{ name: 'Fushimi Inari' }]);
  });

  it('rejects an app_user write outright (ingest/admin only)', async () => {
    const poiId = await insertPoi();
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, async (tx) => {
        await tx.query("UPDATE pois SET name = 'Hijacked' WHERE id = $1", [poiId]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets app_system insert and update a POI', async () => {
    const poiId = await insertPoi();
    await withSystem(db.pool, (tx) =>
      tx.query("UPDATE pois SET status = 'closed' WHERE id = $1", [poiId]),
    );
    const rows = await withSystem(db.pool, (tx) =>
      tx.query<{ status: string }>('SELECT status FROM pois WHERE id = $1', [poiId]),
    );
    expect(rows.rows).toEqual([{ status: 'closed' }]);
  });

  it('denies guide_reader direct access to public.pois: only llm.pois is granted', async () => {
    const uid = await insertUser(db.pool);
    await expect(
      withGuideReader(db.pool, uid, anonymousActor().uid, (tx) => tx.query('SELECT * FROM pois')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects an invalid category', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, 'X', 'bogus', 0, 0)",
          [destinationId],
        ),
      ),
    ).rejects.toThrow();
  });

  it('rejects an out-of-range latitude', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, 'X', 'other', 999, 0)",
          [destinationId],
        ),
      ),
    ).rejects.toThrow();
  });

  it('rejects a POI merged into itself', async () => {
    const poiId = await insertPoi();
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query('UPDATE pois SET merged_into_id = $1 WHERE id = $1', [poiId]),
      ),
    ).rejects.toThrow();
  });

  it('enforces one POI per (destination-independent) fsq_os source id, for idempotent ingest reruns', async () => {
    await insertPoi({ name: 'A', sourceIds: { fsq_os: 'fsq-1' } });
    await expect(insertPoi({ name: 'B', sourceIds: { fsq_os: 'fsq-1' } })).rejects.toThrow(
      /duplicate key/i,
    );
  });

  it('lets two POIs both have no fsq_os id (partial unique index, not NULL-colliding)', async () => {
    await expect(insertPoi({ name: 'C' })).resolves.toBeDefined();
    await expect(insertPoi({ name: 'D' })).resolves.toBeDefined();
  });

  it('computes a generated, accent-insensitive full-text search column', async () => {
    const poiId = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng)
         VALUES ($1, 'Café Über', 'food', 35.0, 135.0) RETURNING id`,
        [destinationId],
      );
      return firstRow(rows).id;
    });
    const rows = await withSystem(db.pool, (tx) =>
      tx.query("SELECT 1 FROM pois WHERE id = $1 AND fts @@ to_tsquery('simple', 'cafe & uber')", [
        poiId,
      ]),
    );
    expect(rows.rows).toHaveLength(1);
  });

  it('lets guide_reader read the curated catalogue through llm.pois, including live-check flags', async () => {
    const poiId = await insertPoi({ name: 'Nishiki Market' });
    await withSystem(db.pool, (tx) =>
      tx.query(
        'INSERT INTO poi_live_checks (poi_id, is_open_now, checked_at) VALUES ($1, true, now())',
        [poiId],
      ),
    );
    const uid = await insertUser(db.pool);
    const rows = await withGuideReader(db.pool, uid, anonymousActor().uid, (tx) =>
      tx.query<{ name: string; is_open_now: boolean }>(
        'SELECT name, is_open_now FROM llm.pois WHERE id = $1',
        [poiId],
      ),
    );
    expect(rows.rows).toEqual([{ name: 'Nishiki Market', is_open_now: true }]);
  });

  it('excludes ingest-internal columns from llm.pois (no source_ids/curation/merged_into_id)', async () => {
    const uid = await insertUser(db.pool);
    const rows = await withGuideReader(db.pool, uid, anonymousActor().uid, (tx) =>
      tx.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'llm' AND table_name = 'pois'",
      ),
    );
    const columns = rows.rows.map((row: { column_name: string }) => row.column_name);
    expect(columns).not.toEqual(
      expect.arrayContaining(['source_ids', 'curation', 'merged_into_id']),
    );
  });

  it('never exposes a closed/hidden POI through llm.pois', async () => {
    const poiId = await insertPoi({ name: 'Closed Place' });
    await withSystem(db.pool, (tx) =>
      tx.query("UPDATE pois SET status = 'closed' WHERE id = $1", [poiId]),
    );
    const uid = await insertUser(db.pool);
    const rows = await withGuideReader(db.pool, uid, anonymousActor().uid, (tx) =>
      tx.query('SELECT 1 FROM llm.pois WHERE id = $1', [poiId]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('is a member of the powersync publication (trip_pack + explore, docs/data-model.md §3.13)', async () => {
    expect(computePublicationAllowList()).toContain('pois');
    const { rows } = await db.pool.query(
      "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'pois'",
    );
    expect(rows).toHaveLength(1);
    const granted = await db.pool.query(
      "SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'powersync_repl' AND table_name = 'pois' AND privilege_type = 'SELECT'",
    );
    expect(granted.rows).toHaveLength(1);
  });
});
