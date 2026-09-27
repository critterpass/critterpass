import { createPool, runMigrations, withSystem, withUser } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { createSqlSupplierCallAudit } from '@cp/suppliers';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;

beforeAll(async () => {
  postgres = await startPostgres();
  pool = createPool(postgres.getConnectionUri());
  await runMigrations(pool);
}, 240_000);

function pgAudit(onError?: (error: unknown) => void) {
  return createSqlSupplierCallAudit(
    (sql, params) => withSystem(pool, (tx) => tx.query(sql, [...params])),
    onError,
  );
}

afterAll(async () => {
  await pool.end();
  await postgres.stop();
});

const RECORD = {
  supplier: 'travelpayouts',
  endpoint: 'prices_for_dates',
  method: 'GET',
  attempt: 1,
  outcome: 'ok' as const,
  status: 200,
  latencyMs: 12.6,
  costUnits: 1,
};

describe('ops.supplier_calls audit writer', () => {
  it('records one metadata-only row per attempt', async () => {
    await pgAudit()(RECORD);
    const { rows } = await withSystem(pool, (tx) =>
      tx.query(
        'SELECT supplier, endpoint, method, attempt, outcome, status, latency_ms, cost_units FROM ops.supplier_calls',
      ),
    );
    expect(rows).toEqual([
      {
        supplier: 'travelpayouts',
        endpoint: 'prices_for_dates',
        method: 'GET',
        attempt: 1,
        outcome: 'ok',
        status: 200,
        latency_ms: 13,
        cost_units: 1,
      },
    ]);
  });

  it('refuses a URL or query string as the endpoint, without failing the caller', async () => {
    const errors: unknown[] = [];
    const audit = pgAudit((error) => errors.push(error));
    await audit({ ...RECORD, endpoint: 'https://api.travelpayouts.com/x?token=secret' });
    await audit({ ...RECORD, endpoint: 'prices_for_dates?token=secret' });
    expect(errors).toHaveLength(2);
    const { rows } = await withSystem(pool, (tx) =>
      tx.query("SELECT 1 FROM ops.supplier_calls WHERE endpoint LIKE '%secret%'"),
    );
    expect(rows).toHaveLength(0);
  });

  it('is invisible to app_user', async () => {
    await expect(
      withUser(pool, crypto.randomUUID(), 'device', (tx) =>
        tx.query('SELECT count(*) FROM ops.supplier_calls'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
