import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let owner: string;
let other: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  owner = await insertUser(db.pool);
  other = await insertUser(db.pool);
  await withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO user_entitlements (user_id, pass_plus, guide_unlimited_global, icon_styles)
       VALUES ($1, true, true, '{all}')`,
      [owner],
    ),
  );
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('user_entitlements RLS: self-only (class C2, materialised server-side)', () => {
  it('lets the owner read their own row', async () => {
    const rows = await withUser(db.pool, owner, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ pass_plus: boolean }>(
        'SELECT pass_plus FROM user_entitlements WHERE user_id = $1',
        [owner],
      );
      return rows;
    });
    expect(rows).toEqual([{ pass_plus: true }]);
  });

  it('never lets another user read it', async () => {
    const rows = await withUser(db.pool, other, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ '?column?': number }>(
        'SELECT 1 FROM user_entitlements WHERE user_id = $1',
        [owner],
      );
      return rows;
    });
    expect(rows).toEqual([]);
  });

  it('rejects any app_user write, including the owner writing their own row', async () => {
    await expect(
      withUser(db.pool, owner, anonymousActor().device, (tx) =>
        tx.query('UPDATE user_entitlements SET pass_plus = false WHERE user_id = $1', [owner]),
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      withUser(db.pool, other, anonymousActor().device, (tx) =>
        tx.query('INSERT INTO user_entitlements (user_id) VALUES ($1)', [other]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets app_system materialise a row (the recompute path)', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO user_entitlements (user_id, pass_plus) VALUES ($1, false)
         ON CONFLICT (user_id) DO UPDATE SET pass_plus = EXCLUDED.pass_plus`,
        [other],
      ),
    );
    const { rows } = await db.pool.query<{ pass_plus: boolean }>(
      'SELECT pass_plus FROM user_entitlements WHERE user_id = $1',
      [other],
    );
    expect(rows[0]?.pass_plus).toBe(false);
  });
});
