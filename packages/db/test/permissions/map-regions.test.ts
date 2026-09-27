import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computePublicationAllowList } from '../../src/publication';
import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let destinationId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  destinationId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, coverage) VALUES ('cusco', 'Cusco', 'live') RETURNING id",
    );
    return firstRow(rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function insertRegion(version = 'v1'): Promise<string> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO map_regions (destination_id, pmtiles_key, bytes, version)
       VALUES ($1, $2, 1000, $3) RETURNING id`,
      [destinationId, `tiles/cusco/${version}.pmtiles`, version],
    );
    return firstRow(rows).id;
  });
}

describe('map_regions RLS: tile manifests (class C0, read-all)', () => {
  it('is readable by any authenticated app_user', async () => {
    await insertRegion();
    const rows = await withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
      tx.query<{ pmtiles_key: string }>(
        'SELECT pmtiles_key FROM map_regions WHERE destination_id = $1',
        [destinationId],
      ),
    );
    expect(rows.rows).toEqual([{ pmtiles_key: 'tiles/cusco/v1.pmtiles' }]);
  });

  it('rejects an app_user write outright', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query(
          "INSERT INTO map_regions (destination_id, pmtiles_key, bytes, version) VALUES ($1, 'x', 1, 'v2')",
          [destinationId],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets app_system upload a new version without clobbering the previous manifest row', async () => {
    await insertRegion('v3');
    const rows = await withSystem(db.pool, (tx) =>
      tx.query<{ version: string }>(
        'SELECT version FROM map_regions WHERE destination_id = $1 ORDER BY version',
        [destinationId],
      ),
    );
    expect(rows.rows.map((row) => row.version)).toEqual(expect.arrayContaining(['v1', 'v3']));
  });

  it('rejects a duplicate (destination, version)', async () => {
    await expect(insertRegion('v1')).rejects.toThrow(/duplicate key/i);
  });

  it('is a member of the powersync publication (trip_pack, docs/data-model.md §3.13)', async () => {
    expect(computePublicationAllowList()).toContain('map_regions');
    const { rows } = await db.pool.query(
      "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'map_regions'",
    );
    expect(rows).toHaveLength(1);
  });
});
