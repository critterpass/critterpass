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
let guideId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  guideId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO guides (slug, name, colour) VALUES ('tokek', 'Tokek', 'yellow') RETURNING id",
    );
    return firstRow(rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('guides RLS: catalogue (class C0, read-all)', () => {
  it('is readable by any authenticated app_user', async () => {
    const rows = await withUser(
      db.pool,
      anonymousActor().uid,
      anonymousActor().device,
      async (tx) => {
        const { rows } = await tx.query<{ slug: string; colour: string }>(
          'SELECT slug, colour FROM guides WHERE id = $1',
          [guideId],
        );
        return rows;
      },
    );
    expect(rows).toEqual([{ slug: 'tokek', colour: 'yellow' }]);
  });

  it('rejects an app_user write outright', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, async (tx) => {
        await tx.query("UPDATE guides SET colour = 'blue' WHERE id = $1", [guideId]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('enforces the canonical guide palette', async () => {
    await expect(
      withSystem(db.pool, async (tx) => {
        await tx.query(
          "INSERT INTO guides (slug, name, colour) VALUES ('rogue', 'Rogue', 'purple')",
        );
      }),
    ).rejects.toThrow();
  });
});
