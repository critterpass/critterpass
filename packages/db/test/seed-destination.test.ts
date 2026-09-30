import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedOneDestination } from '../seed/destination';
import { withSystem } from '../src/tx';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from './helpers/pg-container';

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

describe('adding one live destination', () => {
  it('writes its row, geofence and unreviewed season and cost drafts, and never overwrites', async () => {
    expect(await seedOneDestination(db.pool, 'da-nang')).toBe(true);
    const row = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        coverage: string;
        currency: string;
        tz: string;
        best_months: number[];
        inside: boolean;
        outside: boolean;
      }>(
        `SELECT id, coverage, currency, tz, best_months,
           ST_Covers(geofence, ST_GeogFromText('POINT(108.3282 15.8782)')) AS inside,
           ST_Covers(geofence, ST_GeogFromText('POINT(106.6602 10.7626)')) AS outside
         FROM destinations WHERE slug = 'da-nang'`,
      );
      return rows[0]!;
    });
    expect(row).toMatchObject({
      coverage: 'live',
      currency: 'VND',
      tz: 'Asia/Ho_Chi_Minh',
      best_months: [3, 4, 5],
      inside: true,
      outside: false,
    });

    const counts = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ months: number; reviewed: number; costs: number }>(
        `SELECT (SELECT count(*)::int FROM season_months WHERE destination_id = $1) AS months,
                (SELECT count(*)::int FROM season_months WHERE destination_id = $1
                   AND reviewed_at IS NOT NULL) AS reviewed,
                (SELECT count(*)::int FROM destination_cost_indices WHERE destination_id = $1
                   AND reviewed_at IS NULL) AS costs`,
        [row.id],
      );
      return rows[0]!;
    });
    expect(counts).toEqual({ months: 12, reviewed: 0, costs: 3 });

    await withSystem(db.pool, (tx) =>
      tx.query("UPDATE destinations SET best_months = '{2,3}' WHERE slug = 'da-nang'"),
    );
    expect(await seedOneDestination(db.pool, 'da-nang')).toBe(false);
    const again = await withSystem(db.pool, (tx) =>
      tx.query<{ best_months: number[] }>(
        "SELECT best_months FROM destinations WHERE slug = 'da-nang'",
      ),
    );
    expect(again.rows[0]?.best_months).toEqual([2, 3]);
  });

  it('refuses a slug the seed does not describe', async () => {
    await expect(seedOneDestination(db.pool, 'atlantis')).rejects.toThrow(/not in seed/);
  });
});
