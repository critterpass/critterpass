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
let destinationId: string;

const actor = anonymousActor();

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  const { rows } = await withSystem(db.pool, (tx) =>
    tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('fare-dest', 'Fare Dest') RETURNING id",
    ),
  );
  destinationId = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

function insertCell(values: {
  origin?: string;
  month?: string;
  price?: number | null;
  fetchedAt?: string | null;
}) {
  return withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO fare_cells (origin_iata, dest_iata, destination_id, month, price_minor, currency, fetched_at, checked_at)
       VALUES ($1, 'DPS', $2, $3, $4, 'USD', $5, now())`,
      [
        values.origin ?? 'SIN',
        destinationId,
        values.month ?? '2026-11-01',
        values.price === undefined ? 13900 : values.price,
        values.fetchedAt === undefined ? new Date().toISOString() : values.fetchedAt,
      ],
    ),
  );
}

describe('fare_cells RLS: catalogue (class C0, read-all, system-written)', () => {
  it('is readable by any authenticated app_user', async () => {
    await insertCell({});
    const rows = await withUser(db.pool, actor.uid, actor.device, async (tx) => {
      const { rows } = await tx.query<{ price_minor: string }>(
        "SELECT price_minor FROM fare_cells WHERE origin_iata = 'SIN' AND month = '2026-11-01'",
      );
      return rows;
    });
    expect(rows).toEqual([{ price_minor: '13900' }]);
  });

  it('rejects an app_user write outright', async () => {
    await expect(
      withUser(db.pool, actor.uid, actor.device, (tx) =>
        tx.query('UPDATE fare_cells SET price_minor = 1'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps one cell per (origin, destination airport, month)', async () => {
    await expect(insertCell({})).rejects.toThrow(/duplicate key/i);
  });

  it('stores "no price seen" as null, never zero, and never a price without its fetch time', async () => {
    await insertCell({ origin: 'HAN', price: null, fetchedAt: null });
    await expect(insertCell({ origin: 'BKK', price: 100, fetchedAt: null })).rejects.toThrow(
      /check constraint/i,
    );
  });

  it('rejects a month that is not the first day, a bad airport code or a same-airport pair', async () => {
    await expect(insertCell({ origin: 'KUL', month: '2026-11-15' })).rejects.toThrow(
      /check constraint/i,
    );
    await expect(insertCell({ origin: 'kul' })).rejects.toThrow(/check constraint/i);
    await expect(insertCell({ origin: 'DPS' })).rejects.toThrow(/check constraint/i);
  });
});
