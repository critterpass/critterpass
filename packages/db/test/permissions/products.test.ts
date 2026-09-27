import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

describe('products RLS: catalogue (class C0, read-all, system-written)', () => {
  it('is readable by any authenticated app_user', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO products (key, type, grants) VALUES ('pass_monthly', 'auto_renew_sub', '["pass_plus"]'::jsonb)`,
      ),
    );
    const rows = await withUser(
      db.pool,
      anonymousActor().uid,
      anonymousActor().device,
      async (tx) => {
        const { rows } = await tx.query<{ type: string; grants: string[] }>(
          "SELECT type, grants FROM products WHERE key = 'pass_monthly'",
        );
        return rows;
      },
    );
    expect(rows).toEqual([{ type: 'auto_renew_sub', grants: ['pass_plus'] }]);
  });

  it('rejects an app_user write outright (system-only)', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, async (tx) => {
        await tx.query(`INSERT INTO products (key, type) VALUES ('pass_yearly', 'auto_renew_sub')`);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects a key outside the closed product set', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(`INSERT INTO products (key, type) VALUES ('not_a_real_product', 'consumable')`),
      ),
    ).rejects.toThrow();
  });

  it('rejects a type outside the closed set', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(`INSERT INTO products (key, type) VALUES ('boost_trip', 'one_time_forever')`),
      ),
    ).rejects.toThrow();
  });

  it('accepts every product in the closed set with its documented type', async () => {
    const closedSet: ReadonlyArray<readonly [string, string]> = [
      ['pass_monthly', 'auto_renew_sub'],
      ['pass_yearly', 'auto_renew_sub'],
      ['boost_trip', 'consumable'],
      ['boost_crew_year', 'auto_renew_sub'],
      ['gift_pass_3m', 'non_renewing'],
    ];
    for (const [key, type] of closedSet) {
      await withSystem(db.pool, (tx) =>
        tx.query(
          'INSERT INTO products (key, type) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET type = EXCLUDED.type',
          [key, type],
        ),
      );
    }
    const { rows } = await db.pool.query<{ count: string }>(
      'SELECT count(*)::text FROM products WHERE key = ANY($1)',
      [closedSet.map(([key]) => key)],
    );
    expect(rows[0]?.count).toBe(String(closedSet.length));
  });
});
