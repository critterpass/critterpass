/**
 * The recap builder against a migrated Postgres and the fixture trip (./recap-world.ts): every
 * number in the recap equals the expected JSON, worked out by hand from the fixture rows; the build
 * reads no location table; a re-run over the same data bumps nothing; a late expense makes version
 * 2 with only the receipt and the award evidence changed, award ids kept; travellers who were IN
 * (the dropout included, the decliner not) become viewers; and Anna's passport gets the trip stamp.
 * Valhalla is the one network boundary, answered from recorded responses.
 */
import { readFileSync } from 'node:fs';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { valhallaRouter } from '../../src/jobs/live-map/meetup-router';
import { buildRecap } from '../../src/jobs/recap/build';
import { startRecapWorld, type Name, type RecapWorld } from './recap-world';

const valhalla = JSON.parse(
  readFileSync(new URL('../fixtures/valhalla/da-nang-recap-legs.json', import.meta.url), 'utf8'),
) as { legs: Record<string, unknown> };

interface ValhallaBody {
  sources: { lat: number; lon: number }[];
  targets: { lat: number; lon: number }[];
}

const recordedValhalla: typeof fetch = (_input, init) => {
  const body = JSON.parse(init?.body as string) as ValhallaBody;
  const [from, to] = [body.sources[0], body.targets[0]];
  const answer = valhalla.legs[`${from?.lat},${from?.lon}>${to?.lat},${to?.lon}`];
  return Promise.resolve(
    answer === undefined ? new Response('no route', { status: 400 }) : Response.json(answer),
  );
};

const router = valhallaRouter({ baseUrl: 'http://valhalla.test', fetch: recordedValhalla });

/** Tables that hold raw positions; the recap must never read one. */
const LOCATION_TABLES = [
  'location_fixes',
  'location_shares',
  'member_etas',
  'encounter_samples',
  'encounter_evidence',
];

let world: RecapWorld;
let recorded: string[];
let pool: pg.Pool;

beforeAll(async () => {
  world = await startRecapWorld();
  recorded = [];
  pool = new pg.Pool({ connectionString: world.harness.postgres.getConnectionUri(), max: 2 });
  pool.on('connect', (client) => {
    const query = client.query.bind(client) as (...args: unknown[]) => unknown;
    (client as unknown as { query: (...args: unknown[]) => unknown }).query = (...args) => {
      const [first] = args;
      recorded.push(typeof first === 'string' ? first : String((first as { text?: string }).text));
      return query(...args);
    };
  });
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await world?.stop();
});

/** Replaces the expected JSON's `@…` placeholders with the fixture's ids. */
function resolve(value: unknown): unknown {
  const id = (token: string): string => {
    if (token.startsWith('user:')) return world.users[token.slice(5) as Name];
    if (token.startsWith('poi:')) return world.ids[token.slice(4)] as string;
    return world.ids[token] as string;
  };
  if (typeof value === 'string' && value.startsWith('@sorted:')) {
    return value.slice(8).split(',').map(id).sort();
  }
  if (typeof value === 'string' && value.startsWith('@')) return id(value.slice(1));
  if (Array.isArray(value)) return value.map(resolve);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
  }
  return value;
}

const expected = () =>
  resolve(
    JSON.parse(readFileSync(new URL('./expected-recap.json', import.meta.url), 'utf8')),
  ) as Record<string, unknown>;

async function recapRow() {
  const [row] = await world.q<Record<string, unknown>>(
    `SELECT id, status, version, stats, route, receipt, got_away, changed_sections,
            ended_on::text AS ended_on, mvp_closes_at, ready_at
       FROM recaps WHERE trip_id = $1`,
    [world.tripId],
  );
  return row!;
}

async function awards() {
  return world.q<Record<string, unknown>>(
    `SELECT id, user_id, kind, metric, value, evidence FROM recap_awards
      WHERE trip_id = $1 ORDER BY user_id`,
    [world.tripId],
  );
}

const byUser = (rows: readonly Record<string, unknown>[]) =>
  [...rows].sort((a, b) => (String(a['user_id']) < String(b['user_id']) ? -1 : 1));

describe('recap.build', { timeout: 60_000 }, () => {
  it('builds a ready recap whose every number matches the fixture', async () => {
    const outcome = await buildRecap(
      pool,
      { trip_id: world.tripId, reason: 'trip_ended', ended_on: '2026-10-04' },
      { router },
      new Date('2026-10-04T17:05:00Z'),
    );
    expect(outcome).toMatchObject({ outcome: 'built', version: 1, bumped: true });

    const want = expected();
    const row = await recapRow();
    expect(row['status']).toBe('ready');
    expect(row['version']).toBe(1);
    expect(row['ended_on']).toBe('2026-10-04');
    expect(row['changed_sections']).toEqual([]);
    expect(row['stats']).toEqual(want['stats']);
    expect(row['route']).toEqual(want['route']);
    expect(row['receipt']).toEqual(want['receipt']);
    expect(row['got_away']).toEqual(want['got_away']);
    expect((row['mvp_closes_at'] as Date).toISOString()).toBe('2026-10-07T17:05:00.000Z');
    expect(byUser(await awards()).map(({ id: _id, ...award }) => award)).toEqual(
      byUser(want['awards'] as Record<string, unknown>[]),
    );
  });

  it('reads no table that holds a position', () => {
    expect(recorded.length).toBeGreaterThan(0);
    for (const sql of recorded) {
      for (const table of LOCATION_TABLES)
        expect(sql, table).not.toMatch(new RegExp(`\\b${table}\\b`));
    }
  });

  it('makes everyone who was IN a viewer, the dropout included, and nobody who declined', async () => {
    const viewers = await world.q<{ user_id: string; opened_at: Date | null }>(
      'SELECT user_id, opened_at FROM recap_views WHERE trip_id = $1 ORDER BY user_id',
      [world.tripId],
    );
    const { anna, ben, cora, dev, eli } = world.users;
    expect(viewers.map((v) => v.user_id)).toEqual([anna, ben, cora, dev, eli].sort());
    expect(viewers.every((v) => v.opened_at === null)).toBe(true);
  });

  it("stamps Anna's passport with the trip, after her home stamp", async () => {
    const stamps = await world.q<Record<string, unknown>>(
      `SELECT kind, seq_no, status, ink_colour, country, dates::text AS dates, destination_id
         FROM stamps WHERE user_id = $1 ORDER BY seq_no`,
      [world.users.anna],
    );
    expect(stamps).toEqual([
      expect.objectContaining({ kind: 'home', seq_no: 1 }),
      {
        kind: 'trip',
        seq_no: 2,
        status: 'stamped',
        ink_colour: 'orange',
        country: 'VN',
        dates: '[2026-10-02,2026-10-05)',
        destination_id: world.ids['destination'],
      },
    ]);
    const others = await world.q('SELECT 1 FROM stamps WHERE trip_id = $1 AND user_id <> $2', [
      world.tripId,
      world.users.anna,
    ]);
    expect(others).toEqual([]);
  });

  it('bumps nothing when it re-runs over the same data', async () => {
    const before = await awards();
    const outcome = await buildRecap(
      pool,
      { trip_id: world.tripId, reason: 'late_data' },
      { router },
    );
    expect(outcome).toMatchObject({ outcome: 'built', version: 1, bumped: false });
    expect((await recapRow())['version']).toBe(1);
    expect(await awards()).toEqual(before);
  });

  it('makes version 2 when a late expense lands, keeping award ids', async () => {
    const before = await awards();
    await world.addExpense({
      by: 'dev',
      minor: 250_000,
      category: 'food',
      description: 'Chè',
      localDate: '2026-10-04',
      spentAt: '2026-10-04T10:00:00Z',
    });
    const outcome = await buildRecap(
      pool,
      { trip_id: world.tripId, reason: 'late_data' },
      { router },
    );
    expect(outcome).toMatchObject({ outcome: 'built', version: 2, bumped: true });

    const row = await recapRow();
    const want = expected();
    expect(row['version']).toBe(2);
    expect(row['changed_sections']).toEqual(['receipt', 'awards']);
    expect(row['stats']).toEqual(want['stats']);
    expect(row['route']).toEqual(want['route']);
    expect(row['receipt']).toEqual({
      ...(want['receipt'] as object),
      lines: [
        { category: 'stays', total_minor: 3_000_000, count: 1 },
        { category: 'food', total_minor: 1_250_000, count: 3 },
        { category: 'transit', total_minor: 500_000, count: 1 },
        { category: 'fun', total_minor: 1_200_000, count: 1 },
      ],
      total_minor: 5_950_000,
      expenses: 6,
      meals: 3,
      each_minor: 1_190_000,
      under_minor: 1_550_000,
    });
    const after = await awards();
    expect(after.map((a) => a['id'])).toEqual(before.map((a) => a['id']));
    const ben = after.find((a) => a['user_id'] === world.users.ben);
    expect(ben).toMatchObject({
      kind: 'treasurer',
      value: 3,
      evidence: { crew_total: 6, share_pct: 50 },
    });
  });

  it('skips a trip that does not exist or has not ended', async () => {
    const [{ id }] = (await world.q<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [world.crewId],
    )) as [{ id: string }];
    await expect(
      buildRecap(pool, { trip_id: id, reason: 'trip_ended' }, { router }),
    ).resolves.toEqual({ outcome: 'skipped', reason: 'not_ended' });
    await expect(
      buildRecap(
        pool,
        { trip_id: '0199a000-0000-7000-8000-000000000000', reason: 'retry' },
        { router },
      ),
    ).resolves.toEqual({ outcome: 'skipped', reason: 'no_trip' });
  });
});
