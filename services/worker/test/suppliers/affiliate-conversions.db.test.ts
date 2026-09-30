/**
 * `supplier.affiliate_conversions` against a migrated Postgres and Travelpayouts' recorded (no
 * bookings yet) and published (one paid booking) statistics: the booking lands once as a
 * conversion in US cents, a re-run changes nothing, and an account with no bookings writes none.
 * Every statistics call is audited.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createSqlSupplierCallAudit, createSupplierHttp } from '@cp/suppliers';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { importConversions } from '../../src/jobs/suppliers/affiliate-conversions';
import { startSetupWorld, type SetupWorld } from '../setup/setup-fixture';

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../../../packages/suppliers/test/travelpayouts/fixtures',
);

let world: SetupWorld;

beforeAll(async () => {
  world = await startSetupWorld(1);
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

function httpServing(file: string) {
  const body = readFileSync(path.join(FIXTURES, file), 'utf8');
  return createSupplierHttp({
    fetch: () => Promise.resolve(new Response(body, { status: 200 })),
    audit: createSqlSupplierCallAudit((sql, params) =>
      withSystem(world.harness.pool, (tx) => tx.query(sql, [...params])),
    ),
  });
}

describe('supplier.affiliate_conversions', () => {
  it('writes nothing for an account with no bookings yet', async () => {
    const http = httpServing('statistics-actions-since-2026-09-01.json');
    expect(await importConversions(world.harness.pool, { http, token: 't' })).toEqual({
      read: 0,
      written: 0,
    });
  });

  it('keeps a reported booking once, in cents, and a re-run changes nothing', async () => {
    const http = httpServing('statistics-actions-published-sample.json');
    const now = new Date('2025-07-01T00:00:00Z');
    expect(await importConversions(world.harness.pool, { http, token: 't' }, now)).toEqual({
      read: 1,
      written: 1,
    });
    expect(await importConversions(world.harness.pool, { http, token: 't' }, now)).toEqual({
      read: 1,
      written: 0,
    });
    const rows = await world.q<Record<string, unknown>>(
      `SELECT partner, external_id, click_id, status, price_minor::int AS price,
              commission_minor::int AS commission, currency, occurred_on::text AS occurred_on
         FROM affiliate_conversions`,
    );
    expect(rows).toEqual([
      {
        partner: 'travelpayouts',
        external_id: 'b91cb378-770e-55c7-b126d10',
        click_id: null,
        status: 'paid',
        price: 428800,
        commission: 4714,
        currency: 'USD',
        occurred_on: '2025-06-23',
      },
    ]);
    const audits = await world.q<{ n: number }>(
      "SELECT count(*)::int AS n FROM ops.supplier_calls WHERE endpoint = 'statistics_actions'",
    );
    expect(audits[0]?.n).toBe(3);
  });
});
