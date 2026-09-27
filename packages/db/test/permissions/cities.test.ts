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

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('cities RLS: "somewhere else" search index (class C0, read-all, not synced)', () => {
  it('is readable by any authenticated app_user, with no crew or trip needed', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO cities (name, country, lat, lng, population, iata_nearby, source_id)
         VALUES ('Chiang Mai', 'Thailand', 18.7883, 98.9853, 127240, ARRAY['CNX'], 'overture-chiang-mai')`,
      ),
    );
    const rows = await withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
      tx.query<{ name: string; iata_nearby: string[] }>(
        "SELECT name, iata_nearby FROM cities WHERE name = 'Chiang Mai'",
      ),
    );
    expect(rows.rows).toEqual([{ name: 'Chiang Mai', iata_nearby: ['CNX'] }]);
  });

  it('rejects an app_user write outright', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query("INSERT INTO cities (name, country, lat, lng) VALUES ('Hack', 'X', 0, 0)"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects an out-of-range longitude', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query("INSERT INTO cities (name, country, lat, lng) VALUES ('X', 'Y', 0, 999)"),
      ),
    ).rejects.toThrow();
  });

  it('enforces one row per Overture source id, for idempotent ingest reruns', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO cities (name, country, lat, lng, source_id) VALUES ('Dup', 'X', 1, 1, 'overture-chiang-mai')",
        ),
      ),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('is excluded from the powersync publication despite its C0 privacy class', () => {
    expect(computePublicationAllowList()).not.toContain('cities');
  });
});
