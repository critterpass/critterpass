import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readCostIndexSeed, seedCostIndices } from '../../seed/cost-indices/load';
import { DESTINATIONS } from '../../seed/destinations';
import { withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { idsByTable, startStreamHarness } from '../helpers/stream-harness';

let container: DbTestContainer;
let db: DbTestDatabase;
let destinationId: string;
const device = anonymousActor().device;

const INSERT = `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low, nightly_minor_high,
    food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on, reviewed_at)
  VALUES ($1, $2, $3, $4, 2750, 1250, 'USD', 'Editorial estimate', '2026-09-28', $5)`;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  const { rows } = await withSystem(db.pool, (tx) =>
    tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('kyoto-costs', 'Kyoto') RETURNING id",
    ),
  );
  destinationId = rows[0]!.id;
  await withSystem(db.pool, async (tx) => {
    await tx.query(INSERT, [destinationId, 'ryokan', 9_000, 11_000, new Date()]);
    await tx.query(INSERT, [destinationId, 'apartment', 4_000, 5_000, null]);
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('destination_cost_indices RLS: reviewed rows for everyone', () => {
  it('serves reviewed rows only, to any signed-in uid', async () => {
    for (const uid of [anonymousActor().uid]) {
      const rows = await withUser(
        db.pool,
        uid,
        device,
        async (tx) =>
          (await tx.query<{ stay_type: string }>('SELECT stay_type FROM destination_cost_indices'))
            .rows,
      );
      expect(rows).toEqual([{ stay_type: 'ryokan' }]);
    }
  });

  it('rejects app_user writes and inverted ranges', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, device, (tx) =>
        tx.query(INSERT, [destinationId, 'hostel', 1, 2, null]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withSystem(db.pool, (tx) => tx.query(INSERT, [destinationId, 'hotel', 5, 4, null])),
    ).rejects.toThrow(/check constraint/i);
  });
});

describe('destination_cost_indices in the catalogue stream', () => {
  it('syncs reviewed rows only', async () => {
    const harness = await startStreamHarness();
    try {
      const { rows } = await withSystem(harness.db.pool, (tx) =>
        tx.query<{ id: string }>(
          "INSERT INTO destinations (slug, name) VALUES ('lisbon-costs', 'Lisbon') RETURNING id",
        ),
      );
      const dest = rows[0]!.id;
      await withSystem(harness.db.pool, async (tx) => {
        await tx.query(INSERT, [dest, 'hotel', 8_000, 12_000, new Date()]);
        await tx.query(INSERT, [dest, 'hostel', 2_000, 3_000, null]);
      });
      const synced = await harness.rows('catalog', 'outsider');
      expect(synced.get('destination_cost_indices')?.map((r) => r['stay_type'])).toEqual(['hotel']);
      expect(idsByTable(synced)['destination_cost_indices']).toHaveLength(1);
    } finally {
      await harness.stop();
    }
  }, 240_000);
});

describe('editorial cost index seed', () => {
  it('covers every live destination and loads as unreviewed drafts, idempotently', async () => {
    const rows = readCostIndexSeed();
    expect(new Set(rows.map((r) => r.destination))).toEqual(
      new Set(DESTINATIONS.map((d) => d.slug)),
    );
    await withSystem(db.pool, (tx) =>
      tx.query("INSERT INTO destinations (slug, name) VALUES ('kyoto', 'Kyoto'), ('bali', 'Bali')"),
    );
    await seedCostIndices(db.pool);
    await seedCostIndices(db.pool);
    const { rows: loaded } = await withSystem(db.pool, (tx) =>
      tx.query<{ n: string; reviewed: string }>(
        `SELECT count(*) AS n, count(reviewed_at) AS reviewed FROM destination_cost_indices i
         JOIN destinations d ON d.id = i.destination_id WHERE d.slug IN ('kyoto', 'bali')`,
      ),
    );
    const expected = rows.filter((r) => r.destination === 'kyoto' || r.destination === 'bali');
    expect(loaded[0]).toEqual({ n: String(expected.length), reviewed: '0' });
  });
});
