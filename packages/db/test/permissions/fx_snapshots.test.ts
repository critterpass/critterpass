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

describe('fx_snapshots RLS: catalogue (class C0, read-all, system-written)', () => {
  it('is readable by any authenticated app_user, with no crew or trip needed', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        "INSERT INTO fx_snapshots (base, quote, rate, as_of, source) VALUES ('EUR', 'SGD', 1.4571, '2026-09-25', 'frankfurter')",
      ),
    );
    const rows = await withUser(
      db.pool,
      anonymousActor().uid,
      anonymousActor().device,
      async (tx) => {
        const { rows } = await tx.query<{ quote: string; rate: string }>(
          "SELECT quote, rate FROM fx_snapshots WHERE base = 'EUR' AND as_of = '2026-09-25'",
        );
        return rows;
      },
    );
    expect(rows).toEqual([{ quote: 'SGD', rate: '1.4571000000' }]);
  });

  it('rejects an app_user write outright (system-only)', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, async (tx) => {
        await tx.query(
          "INSERT INTO fx_snapshots (base, quote, rate, as_of, source) VALUES ('EUR', 'JPY', 180.4, '2026-09-25', 'frankfurter')",
        );
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects a non-positive rate', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO fx_snapshots (base, quote, rate, as_of, source) VALUES ('EUR', 'IDR', 0, '2026-09-26', 'frankfurter')",
        ),
      ),
    ).rejects.toThrow();
  });

  it('rejects a base equal to quote', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO fx_snapshots (base, quote, rate, as_of, source) VALUES ('EUR', 'EUR', 1, '2026-09-26', 'frankfurter')",
        ),
      ),
    ).rejects.toThrow();
  });

  it('re-inserting the same (base, quote, as_of, source) via ON CONFLICT DO NOTHING creates no duplicate', async () => {
    const upsert = () =>
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
           VALUES ('EUR', 'VND', 29546, '2026-09-27', 'frankfurter')
           ON CONFLICT (base, quote, as_of, source) DO NOTHING`,
        ),
      );
    await upsert();
    await upsert();
    await upsert();

    const rows = await withSystem(db.pool, (tx) =>
      tx.query(
        "SELECT rate FROM fx_snapshots WHERE base = 'EUR' AND quote = 'VND' AND as_of = '2026-09-27' AND source = 'frankfurter'",
      ),
    );
    expect(rows.rows).toHaveLength(1);
  });

  it('keeps distinct rows per source for the same (base, quote, as_of)', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        "INSERT INTO fx_snapshots (base, quote, rate, as_of, source) VALUES ('EUR', 'THB', 41.2, '2026-09-27', 'ecb')",
      ),
    );
    await withSystem(db.pool, (tx) =>
      tx.query(
        "INSERT INTO fx_snapshots (base, quote, rate, as_of, source) VALUES ('EUR', 'THB', 41.3, '2026-09-27', 'frankfurter')",
      ),
    );
    const rows = await withSystem(db.pool, (tx) =>
      tx.query(
        "SELECT source, rate FROM fx_snapshots WHERE base = 'EUR' AND quote = 'THB' AND as_of = '2026-09-27' ORDER BY source",
      ),
    );
    expect(rows.rows).toEqual([
      { source: 'ecb', rate: '41.2000000000' },
      { source: 'frankfurter', rate: '41.3000000000' },
    ]);
  });
});

describe('fx_snapshots is on the powersync publication', () => {
  it('is readable via the powersync_repl replication role grant', async () => {
    const { rows } = await db.pool.query(
      "SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'powersync_repl' AND table_name = 'fx_snapshots' AND privilege_type = 'SELECT'",
    );
    expect(rows).toHaveLength(1);
  });
});
