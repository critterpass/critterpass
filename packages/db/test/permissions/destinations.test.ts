import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
      "INSERT INTO destinations (slug, name, coverage) VALUES ('bali', 'Bali', 'live') RETURNING id",
    );
    return firstRow(rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('destinations RLS: catalogue (class C0, read-all)', () => {
  it('is readable by any authenticated app_user, with no crew or trip needed', async () => {
    const rows = await withUser(db.pool, anonymousActor().uid, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ slug: string }>('SELECT slug FROM destinations WHERE id = $1', [
        destinationId,
      ]);
      return rows;
    });
    expect(rows).toEqual([{ slug: 'bali' }]);
  });

  it('rejects an app_user write outright (admin/system only)', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, async (tx) => {
        await tx.query("UPDATE destinations SET name = 'Hijacked' WHERE id = $1", [destinationId]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects an invalid coverage value', async () => {
    await expect(
      withSystem(db.pool, async (tx) => {
        await tx.query("INSERT INTO destinations (slug, name, coverage) VALUES ('x', 'X', 'bogus')");
      }),
    ).rejects.toThrow();
  });
});
