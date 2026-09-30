/**
 * The AeroDataBox budget and pacing against a migrated Postgres, with the provider answered at the
 * network boundary: a spent monthly budget makes no call, a 429 is one call and no reading, and two
 * checks racing on separate workers are spaced at least a second apart.
 */
import { withSystem } from '@cp/db';
import {
  AERODATABOX_SUPPLIER,
  createAeroDataBoxClient,
  createSqlSupplierCallAudit,
  createSupplierHttp,
  type AeroDataBoxClient,
} from '@cp/suppliers';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createAdbGate } from '../../src/jobs/flights/adb-budget';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let calls: number[] = [];
let status = 200;

function adbClient(): AeroDataBoxClient {
  const http = createSupplierHttp({
    audit: createSqlSupplierCallAudit((sql, params) =>
      withSystem(harness.pool, (tx) => tx.query(sql, [...params])),
    ),
    fetch: () => {
      calls.push(Date.now());
      return Promise.resolve(
        new Response(status === 200 ? '[]' : '{"message":"Too many requests"}', { status }),
      );
    },
  });
  return createAeroDataBoxClient(http, { apiKey: 'fixture-key' });
}

const read = (client: AeroDataBoxClient) => () => client.flightsOn('SQ', '938', '2026-10-12');

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterEach(async () => {
  calls = [];
  status = 200;
  await harness.pool.query('DELETE FROM ops.supplier_calls');
});

afterAll(async () => {
  await harness?.stopAll();
});

describe('aerodatabox budget', () => {
  it('makes no call once the month is spent, and warns once a day', async () => {
    await harness.pool.query(
      `INSERT INTO ops.supplier_calls (supplier, endpoint, method, outcome, status, latency_ms)
       SELECT $1, 'flights_by_number', 'GET', 'ok', 200, 10 FROM generate_series(1, 3)`,
      [AERODATABOX_SUPPLIER],
    );
    const warnings: string[] = [];
    const logger = { warn: (_: object, message: string) => warnings.push(message) };
    const gate = createAdbGate(harness.pool, { monthlyCalls: 3 });
    const client = adbClient();

    expect(await gate.run(read(client), logger)).toEqual([]);
    expect(await gate.run(read(client), logger)).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it('counts failed calls against the month', async () => {
    status = 500;
    const gate = createAdbGate(harness.pool, { monthlyCalls: 1, spacingMs: 0 });
    const client = adbClient();
    await expect(gate.run(read(client))).rejects.toThrow();
    expect(await gate.run(read(client))).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('reads a 429 as no reading after a single call', async () => {
    status = 429;
    const gate = createAdbGate(harness.pool, { monthlyCalls: 380 });
    expect(await gate.run(read(adbClient()))).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('spaces checks from separate workers at least a second apart', async () => {
    const client = adbClient();
    const workers = [
      createAdbGate(harness.pool, { monthlyCalls: 380 }),
      createAdbGate(harness.pool, { monthlyCalls: 380 }),
    ];
    await Promise.all(workers.map((gate) => gate.run(read(client))));
    expect(calls).toHaveLength(2);
    const [first, second] = [...calls].sort((a, b) => a - b) as [number, number];
    expect(second - first).toBeGreaterThanOrEqual(1000);
  });
});
