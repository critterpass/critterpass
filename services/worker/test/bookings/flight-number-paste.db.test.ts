/**
 * A flight number pasted on its own, against a migrated Postgres and AeroDataBox replayed at the
 * network boundary from a recorded answer (9G 956 SGN → DAD, departing 2, 3 and 4 October 2026).
 * One call over the trip's days, inside the AeroDataBox budget: the traveller flying from home
 * gets the first day's flight as a normal candidate, a typed date picks its own day, a daily
 * flight with nothing to tell the days apart asks for the date and route, and a spent budget makes
 * no call and asks the same.
 */
import { readFileSync } from 'node:fs';

import { withSystem } from '@cp/db';
import {
  AERODATABOX_SUPPLIER,
  createAeroDataBoxClient,
  createSqlSupplierCallAudit,
  createSupplierHttp,
} from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exponentOf } from '../../src/jobs/bookings';
import { parseImport, type ImportParseDeps } from '../../src/jobs/bookings/paste-parse';
import { createAdbGate } from '../../src/jobs/flights/adb-budget';
import { startSetupWorld, type SetupWorld } from '../setup/setup-fixture';

const RECORDED = readFileSync(
  new URL('./fixtures/aerodatabox-9g956-2026-10-02-to-04.json', import.meta.url),
  'utf8',
);

let world: SetupWorld;
const urls: string[] = [];

function depsWith(monthlyCalls: number): ImportParseDeps {
  const http = createSupplierHttp({
    audit: createSqlSupplierCallAudit((sql, params) =>
      withSystem(world.harness.pool, (tx) => tx.query(sql, [...params])),
    ),
    fetch: (url) => {
      urls.push(url.toString());
      return Promise.resolve(new Response(RECORDED, { status: 200 }));
    },
  });
  const adb = createAeroDataBoxClient(http, { apiKey: 'fixture-key' });
  const gate = createAdbGate(world.harness.pool, { monthlyCalls, spacingMs: 0 });
  return {
    exponentOf,
    fetch: {
      lookup: () => Promise.reject(new Error('no network in this suite')),
      transport: () => Promise.reject(new Error('no network in this suite')),
    },
    now: () => new Date('2026-10-01T12:00:00Z'),
    schedule: (carrier, number, from, to) =>
      gate.run(() => adb.flightsDeparting(carrier, number, from, to)),
  };
}

async function paste(uid: string, text: string, deps: ImportParseDeps) {
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO import_candidates (user_id, crew_id, trip_id, source, dedupe_key, status)
     VALUES ($1, $2, $3, 'paste', 'pending:' || gen_random_uuid(), 'parsing') RETURNING id`,
    [uid, world.crewId, world.tripId],
  );
  const outcome = await parseImport(world.harness.pool, deps, {
    candidate_id: row?.id as string,
    kind: 'paste',
    text,
  });
  const [candidate] = await world.q<{
    status: string;
    failure_reason: string | null;
    extracted: {
      title: string;
      starts_at: string;
      ends_at: string;
      tz: string;
      extracted_by: string;
      segments: { dep_airport: string; arr_airport: string; sched_dep_at: string }[];
    } | null;
  }>('SELECT status, failure_reason, extracted FROM import_candidates WHERE id = $1', [row?.id]);
  return { outcome, candidate };
}

async function audited(): Promise<number> {
  const [row] = await world.q<{ n: number }>(
    'SELECT count(*)::int AS n FROM ops.supplier_calls WHERE supplier = $1',
    [AERODATABOX_SUPPLIER],
  );
  return row?.n ?? 0;
}

beforeAll(async () => {
  world = await startSetupWorld(3);
  await world.q(
    `UPDATE trips SET tz = 'Asia/Ho_Chi_Minh', start_date = '2026-10-02', end_date = '2026-10-04'
      WHERE id = $1`,
    [world.tripId],
  );
  await world.q("UPDATE users SET home_airport = 'SGN' WHERE id = $1", [world.members[0]]);
  await world.q("UPDATE users SET home_airport = 'HAN' WHERE id = $1", [world.members[2]]);
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('a pasted flight number', () => {
  it('becomes the first day flight from home, in one audited call over the trip days', async () => {
    const { outcome, candidate } = await paste(world.members[0] as string, '9G 956', depsWith(380));
    expect(outcome).toBe('parsed');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain(
      '/flights/number/9G956/2026-10-02/2026-10-04?dateLocalRole=Departure',
    );
    expect(await audited()).toBe(1);
    expect(candidate).toMatchObject({ status: 'pending', failure_reason: null });
    expect(candidate?.extracted).toMatchObject({
      title: '9G 956 · SGN → DAD',
      starts_at: '2026-10-02T00:05:00.000Z',
      ends_at: '2026-10-02T01:30:00.000Z',
      tz: 'Asia/Ho_Chi_Minh',
      extracted_by: 'schedule',
      segments: [
        { dep_airport: 'SGN', arr_airport: 'DAD', sched_dep_at: '2026-10-02T00:05:00.000Z' },
      ],
    });
  });

  it('takes the day typed with it', async () => {
    const { candidate } = await paste(world.members[1] as string, '9g956 3 Oct', depsWith(380));
    expect(candidate?.status).toBe('pending');
    expect(candidate?.extracted?.starts_at).toBe('2026-10-03T00:05:00.000Z');
  });

  it('asks for the date and route when a daily flight could be any of the days', async () => {
    const { outcome, candidate } = await paste(world.members[2] as string, '9G 956', depsWith(380));
    expect(outcome).toBe('failed');
    expect(candidate).toMatchObject({ status: 'failed', failure_reason: 'flight_not_found' });
  });

  it('makes no call once the month budget is spent, and asks for the date and route', async () => {
    const before = urls.length;
    const { candidate } = await paste(world.members[0] as string, '9G 956 2/10', depsWith(0));
    expect(urls).toHaveLength(before);
    expect(candidate).toMatchObject({ status: 'failed', failure_reason: 'flight_not_found' });
  });
});
