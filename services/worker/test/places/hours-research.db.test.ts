/**
 * `places.hours_research` over a migrated Postgres, with each place's Tavily search and DeepSeek
 * answer replayed from the live recordings the `hours-research` evals use, through the real clients:
 * only curated places without hours, without an open proposal and with hours of their own are
 * researched; cited proposals land for console verification; a decline writes nothing; the spend
 * cap and the route's kill switch stop the run.
 */
import { readFileSync } from 'node:fs';

import { createGateway, createTavilySearch, type HoursResearchDeps } from '@cp/ai';
import { runMigrations } from '@cp/db';
import { DomainError } from '@cp/domain';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { JobLogger } from '../../src/boss/define-job';
import { runHoursResearch, type HoursResearchConfig } from '../../src/jobs/hours-research/run';

interface Recorded {
  readonly status: number;
  readonly body: unknown;
}
interface Fixture {
  readonly recorded_at: string;
  readonly search: Recorded & { readonly body: { readonly query: string } };
  readonly model: Recorded;
}

const load = (id: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../packages/ai/evals/hours-research/fixtures/${id}.json`, import.meta.url),
      'utf8',
    ),
  ) as Fixture;

/** The recorded places, by the name the search and the model request carry. */
const RECORDED = {
  元離宮二条城: load('hours-03'),
  'Fushimi Inari Taisha': load('hours-04'),
  亀末廣: load('hours-02'),
} as const;
const NOW = new Date(RECORDED['元離宮二条城'].recorded_at);

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let kyoto: string;
let searched: string[];

const logger: JobLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };
const CONFIG: HoursResearchConfig = { runCap: 300, maxUsd: 2, concurrency: 2 };

/** Serves the recording of whichever place the request names; anything else fails the call. */
function served(pick: (fixture: Fixture) => Recorded, log?: string[]): typeof fetch {
  return (_input, init) => {
    const body = typeof init?.body === 'string' ? init.body : '';
    if (log !== undefined) log.push((JSON.parse(body) as { query: string }).query);
    const entry = Object.entries(RECORDED).find(([name]) => body.includes(name));
    if (entry === undefined) return Promise.reject(new TypeError('no recording for this request'));
    const recorded = pick(entry[1]);
    return Promise.resolve(
      new Response(JSON.stringify(recorded.body), {
        status: recorded.status,
        headers: { 'content-type': 'application/json', 'request-id': 'req_recorded' },
      }),
    );
  };
}

function deps(assertRouteOn?: () => Promise<void>): HoursResearchDeps {
  return {
    gateway: createGateway({
      apiKey: 'recorded',
      fetch: served((fixture) => fixture.model),
      maxAttempts: 1,
      ...(assertRouteOn === undefined ? {} : { assertRouteOn }),
    }),
    search: createTavilySearch({
      apiKey: 'recorded',
      fetch: served((fixture) => fixture.search, searched),
    }),
    now: () => NOW,
  };
}

async function insertPoi(
  name: string,
  category: string,
  extra: { curation?: string; hours?: object; address?: string } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, curation, hours, address)
     VALUES ($1, $2, $3, 35.0, 135.75, $4, $5, $6) RETURNING id`,
    [
      kyoto,
      name,
      category,
      extra.curation ?? 'editorial',
      JSON.stringify(extra.hours ?? {}),
      extra.address ?? null,
    ],
  );
  return rows[0]!.id;
}

async function proposals() {
  const { rows } = await pool.query<{
    name: string;
    hours: { weekly: Record<string, { start: string; end: string }[]> };
    source_url: string;
    batch_key: string;
    status: string;
  }>(
    `SELECT p.name, h.hours, h.source_url, h.batch_key, h.status
     FROM poi_hours_proposals h JOIN pois p ON p.id = h.poi_id ORDER BY p.name`,
  );
  return rows;
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz)
     VALUES ('kyoto', 'Kyoto', 'Japan', 'live', 'Asia/Tokyo') RETURNING id`,
  );
  kyoto = rows[0]!.id;
}, 180_000);

beforeEach(async () => {
  searched = [];
  await pool.query('DELETE FROM poi_hours_proposals');
  await pool.query('DELETE FROM pois');
});

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('runHoursResearch', () => {
  it('proposes cited hours for curated places without hours and researches nothing else', async () => {
    await insertPoi('元離宮二条城', 'museum', { address: '中京区二条城町541' });
    await insertPoi('Fushimi Inari Taisha', 'temple_shrine');
    await insertPoi('亀末廣', 'food');
    await insertPoi('Kamogawa riverbank', 'nature');
    await insertPoi('Open data cafe', 'food', { curation: 'auto' });
    await insertPoi('Known hours', 'food', {
      hours: { weekly: { mo: [{ start: '10:00', end: '18:00' }] } },
    });

    const report = await runHoursResearch(pool, deps(), CONFIG, { destination: 'kyoto' }, logger);

    expect(searched.sort()).toEqual([
      'Fushimi Inari Taisha Kyoto opening hours',
      '亀末廣 Kyoto opening hours',
      '元離宮二条城 Kyoto opening hours',
    ]);
    expect(report).toMatchObject({ selected: 3, researched: 3, proposed: 2, failed: 0 });
    expect(report.declined).toEqual({ declined: 1 });
    const rows = await proposals();
    expect(rows.map((row) => [row.name, row.source_url, row.status])).toEqual([
      ['Fushimi Inari Taisha', 'https://www.japan-guide.com/e/e3915.html', 'proposed'],
      ['元離宮二条城', 'https://nijo-jocastle.city.kyoto.lg.jp/guide/annai', 'proposed'],
    ]);
    expect(rows[0]?.hours.weekly['su']).toEqual([{ start: '00:00', end: '24:00' }]);
    expect(rows[1]?.hours.weekly['mo']).toEqual([{ start: '08:45', end: '17:00' }]);
    expect(rows[1]?.batch_key).toMatch(/^research:2026-10-03:0\.\d{2}$/u);

    // A place with an open proposal is not researched again; the declined one is.
    searched = [];
    const rerun = await runHoursResearch(pool, deps(), CONFIG, {}, logger);
    expect(searched).toEqual(['亀末廣 Kyoto opening hours']);
    expect(rerun).toMatchObject({ selected: 1, proposed: 0 });
    expect(await proposals()).toHaveLength(2);
  });

  it('stops at the spend cap', async () => {
    await insertPoi('元離宮二条城', 'museum');
    await insertPoi('Fushimi Inari Taisha', 'temple_shrine');
    const report = await runHoursResearch(
      pool,
      deps(),
      { ...CONFIG, concurrency: 1, maxUsd: 1e-9 },
      {},
      logger,
    );
    expect(report).toMatchObject({ selected: 2, researched: 1, stopped: 'spend_cap' });
  });

  it('stops when the route is switched off, writing nothing', async () => {
    await insertPoi('元離宮二条城', 'museum');
    await insertPoi('Fushimi Inari Taisha', 'temple_shrine');
    const off = () =>
      Promise.reject(
        new DomainError('STATE_INVALID', {
          reason: 'switched_off',
          key: 'ai.route.hours.research',
        }),
      );
    const report = await runHoursResearch(pool, deps(off), CONFIG, {}, logger);
    expect(report).toMatchObject({ proposed: 0, failed: 0, stopped: 'switched_off' });
    expect(await proposals()).toEqual([]);
  });
});
