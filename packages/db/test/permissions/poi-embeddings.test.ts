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
let poiId: string;

function fakeVector(): string {
  return `[${Array.from({ length: 1024 }, () => '0').join(',')}]`;
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  const destinationId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, coverage) VALUES ('lisbon', 'Lisbon', 'live') RETURNING id",
    );
    return firstRow(rows).id;
  });
  poiId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Torre de Belem', 'museum', 38.6916, -9.2160) RETURNING id`,
      [destinationId],
    );
    return firstRow(rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('poi_embeddings RLS: class S, server-only search ranking', () => {
  it('is invisible to app_user: no table grant at all, not just a filtered policy', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query('SELECT poi_id FROM poi_embeddings WHERE poi_id = $1', [poiId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('is invisible to guide_reader: ranking never runs as guide_reader, embeddings are not in an llm.* view', async () => {
    const uid = await insertUser(db.pool);
    await expect(
      withGuideReader(db.pool, uid, anonymousActor().uid, (tx) =>
        tx.query('SELECT poi_id FROM poi_embeddings WHERE poi_id = $1', [poiId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects an app_user write outright', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query("INSERT INTO poi_embeddings (poi_id, model, embedding) VALUES ($1, 'm', $2)", [
          poiId,
          fakeVector(),
        ]),
      ),
    ).rejects.toThrow();
  });

  it('is readable and writable by app_system, keyed on the HNSW-indexed embedding column', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query("INSERT INTO poi_embeddings (poi_id, model, embedding) VALUES ($1, 'm', $2)", [
        poiId,
        fakeVector(),
      ]),
    );
    const rows = await withSystem(db.pool, (tx) =>
      tx.query<{ model: string }>('SELECT model FROM poi_embeddings WHERE poi_id = $1', [poiId]),
    );
    expect(rows.rows).toEqual([{ model: 'm' }]);
  });

  it('cascades on the owning POI being deleted', async () => {
    const orphanDestination = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO destinations (slug, name, coverage) VALUES ('cascade-test', 'X', 'guest') RETURNING id",
      );
      return firstRow(rows).id;
    });
    const orphanPoiId = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, 'Y', 'other', 0, 0) RETURNING id",
        [orphanDestination],
      );
      return firstRow(rows).id;
    });
    await withSystem(db.pool, (tx) =>
      tx.query("INSERT INTO poi_embeddings (poi_id, model, embedding) VALUES ($1, 'm', $2)", [
        orphanPoiId,
        fakeVector(),
      ]),
    );
    await withSystem(db.pool, (tx) => tx.query('DELETE FROM pois WHERE id = $1', [orphanPoiId]));
    const rows = await withSystem(db.pool, (tx) =>
      tx.query('SELECT 1 FROM poi_embeddings WHERE poi_id = $1', [orphanPoiId]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('is excluded from the powersync publication despite its C0 privacy class', () => {
    expect(computePublicationAllowList()).not.toContain('poi_embeddings');
  });
});
