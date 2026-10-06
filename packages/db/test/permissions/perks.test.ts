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

const readAsUser = (sql: string) =>
  withUser(db.pool, anonymousActor().uid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<{ key: string; copy_key: string; is_shipped: boolean }>(sql);
    return rows;
  });

describe('perks RLS: catalogue (class C0, read-all, system-written)', () => {
  it('lists the Pass+ and boost perk lines to any signed-in user, in display order, all switched on', async () => {
    const pass = await readAsUser(
      "SELECT key, copy_key, is_shipped FROM perks WHERE tier = 'pass_plus' ORDER BY sort",
    );
    expect(pass.map((row) => row.key)).toEqual([
      'pass_plus_guide_unlimited',
      'pass_plus_mailbox_import',
      'pass_plus_icon_styles',
      'pass_plus_no_sponsored',
      'pass_plus_next_flight',
      'pass_plus_read_out',
      'pass_plus_postcard',
    ]);
    const boost = await readAsUser(
      "SELECT key, copy_key, is_shipped FROM perks WHERE tier = 'boost' ORDER BY sort",
    );
    expect(boost.map((row) => row.key)).toEqual([
      'boost_redrafts',
      'boost_live_map',
      'boost_seats',
      'boost_guide_unlimited',
      'boost_no_sponsored',
    ]);
    for (const row of [...pass, ...boost]) {
      expect(row.is_shipped).toBe(true);
      expect(row.copy_key).toBe(`monetize.perks.${row.key}`);
    }
  });

  it('has a line for the first free trip and for the crew year', async () => {
    const rows = await readAsUser(
      "SELECT key, copy_key, is_shipped FROM perks WHERE tier IN ('ftf', 'crew_year') ORDER BY sort",
    );
    expect(rows.map((row) => row.key)).toEqual(['ftf_first_trip_free', 'crew_year_everywhere']);
  });

  it('rejects an app_user write outright (system-only)', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, async (tx) => {
        await tx.query(
          `INSERT INTO perks (key, tier, copy_key) VALUES ('boost_from_a_user', 'boost', 'monetize.perks.boost_from_a_user')`,
        );
      }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, async (tx) => {
        await tx.query(`UPDATE perks SET is_shipped = false WHERE key = 'boost_live_map'`);
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

  it('a perk the system switches off stays listed as off, and a new one starts switched on', async () => {
    await withSystem(db.pool, async (tx) => {
      await tx.query(`UPDATE perks SET is_shipped = false WHERE key = 'pass_plus_postcard'`);
      await tx.query(
        `INSERT INTO perks (key, tier, copy_key) VALUES ('boost_new_line', 'boost', 'monetize.perks.boost_new_line')`,
      );
    });
    const rows = await readAsUser(
      "SELECT key, copy_key, is_shipped FROM perks WHERE key IN ('pass_plus_postcard', 'boost_new_line') ORDER BY key",
    );
    expect(rows.map((row) => [row.key, row.is_shipped])).toEqual([
      ['boost_new_line', true],
      ['pass_plus_postcard', false],
    ]);
  });
});
