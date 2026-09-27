import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow } from '../helpers/actors';
import { buildCrewFixture, type CrewFixture } from '../helpers/crew-fixture';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: CrewFixture;
let ownMediaId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildCrewFixture(db.pool);
  ownMediaId = await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256) VALUES ($1, 'k', 'image', 100, 'abc') RETURNING id",
      [fixture.memberId],
    );
    return firstRow(rows).id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('media_objects RLS: class S, no app_user access at all', () => {
  it('is invisible even to its own owner over app_user: no table grant at all, not just a filtered policy', async () => {
    await expect(
      withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
        await tx.query('SELECT id FROM media_objects WHERE id = $1', [ownMediaId]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects an app_user insert outright', async () => {
    await expect(
      withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
        await tx.query(
          "INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256) VALUES ($1, 'k2', 'image', 1, 'x')",
          [fixture.memberId],
        );
      }),
    ).rejects.toThrow();
  });

  it('is readable and writable by app_system', async () => {
    const rows = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string; owner_id: string }>(
        'SELECT id, owner_id FROM media_objects WHERE id = $1',
        [ownMediaId],
      );
      return rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ owner_id: fixture.memberId });
  });
});
