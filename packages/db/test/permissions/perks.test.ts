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

describe('perks RLS: catalogue (class C0, read-all, system-written)', () => {
  it('is readable by any authenticated app_user, in server-set sort order', async () => {
    await withSystem(db.pool, async (tx) => {
      await tx.query(
        `INSERT INTO perks (key, tier, copy_key, sort) VALUES ('boost_live_map', 'boost', 'monetize.perks.boost_live_map', 2)`,
      );
      await tx.query(
        `INSERT INTO perks (key, tier, copy_key, sort) VALUES ('pass_plus_icon_styles', 'pass_plus', 'monetize.perks.pass_plus_icon_styles', 1)`,
      );
    });
    const rows = await withUser(
      db.pool,
      anonymousActor().uid,
      anonymousActor().device,
      async (tx) => {
        const { rows } = await tx.query<{ key: string; is_shipped: boolean }>(
          'SELECT key, is_shipped FROM perks ORDER BY sort',
        );
        return rows;
      },
    );
    expect(rows).toEqual([
      { key: 'pass_plus_icon_styles', is_shipped: true },
      { key: 'boost_live_map', is_shipped: true },
    ]);
  });

  it('rejects an app_user write outright (system-only)', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, async (tx) => {
        await tx.query(
          `INSERT INTO perks (key, tier, copy_key) VALUES ('ftf_first_trip_free', 'ftf', 'monetize.perks.ftf_first_trip_free')`,
        );
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects a tier outside the closed set', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO perks (key, tier, copy_key) VALUES ('bad_tier_perk', 'platinum', 'monetize.perks.bad')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('every seeded perk ships at launch (is_shipped defaults true)', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO perks (key, tier, copy_key) VALUES ('crew_year_everywhere', 'crew_year', 'monetize.perks.crew_year_everywhere')`,
      ),
    );
    const { rows } = await db.pool.query<{ is_shipped: boolean }>(
      "SELECT is_shipped FROM perks WHERE key = 'crew_year_everywhere'",
    );
    expect(rows[0]?.is_shipped).toBe(true);
  });
});
