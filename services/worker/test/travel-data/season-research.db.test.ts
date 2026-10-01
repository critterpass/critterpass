/**
 * `season.research` over a migrated Postgres, with Tavily searches and the DeepSeek extraction
 * replayed from live recordings (test/fixtures/season-research) through the real clients: Kyoto's
 * December run searches code-built queries only, queues cited candidates for review without
 * duplicating a known event, reruns queue nothing, and no queued row is visible to the app.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createGateway, createTavilySearch } from '@cp/ai';
import { withUser } from '@cp/db';
import { seasonResearchQueries } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JobLogger } from '../../src/boss/define-job';
import {
  researchSeasonEvents,
  runSeasonResearch,
  type SeasonResearchDeps,
} from '../../src/travel-data/season-research';
import { startNotifyDb, type NotifyDb } from '../notify-fixtures';
import { insertLiveDestinations } from './travel-fixtures';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures/season-research');
const SEARCHES = [1, 2, 3].map((n) => `tavily-kyoto-2026-12-${n}`);
const EXTRACTION = 'deepseek-kyoto-2026-12';
const NOW = new Date('2026-09-28T00:00:00Z');
const MONTH = '2026-12';

const quietLogger: JobLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Replays the named recordings in order; a request with none left fails like a network error. */
function replay(names: readonly string[]) {
  const queue = [...names];
  const bodies: Record<string, unknown>[] = [];
  const fetch: typeof globalThis.fetch = (_input, init) => {
    const name = queue.shift();
    if (name === undefined) return Promise.reject(new TypeError('no recording left'));
    const body = typeof init?.body === 'string' ? init.body : '{}';
    bodies.push(JSON.parse(body) as Record<string, unknown>);
    const { response } = JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8')) as {
      response: { status: number; body: unknown };
    };
    return Promise.resolve(
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { 'content-type': 'application/json', 'request-id': `req_${name}` },
      }),
    );
  };
  return { fetch, bodies };
}

function deps(searches: readonly string[], extraction: readonly string[] = [EXTRACTION]) {
  const search = replay(searches);
  const model = replay(extraction);
  const value: SeasonResearchDeps = {
    search: createTavilySearch({ apiKey: 'recorded', fetch: search.fetch }),
    gateway: createGateway({ apiKey: 'recorded', fetch: model.fetch, maxAttempts: 1 }),
    now: () => NOW,
  };
  return { deps: value, searchBodies: search.bodies, modelBodies: model.bodies };
}

let db: NotifyDb;
let kyoto: string;

beforeAll(async () => {
  db = await startNotifyDb();
  kyoto = (await insertLiveDestinations(db.pool))['kyoto'] ?? '';
  await db.pool.query(`UPDATE destinations SET name = 'Kyoto', country = 'Japan' WHERE id = $1`, [
    kyoto,
  ]);
  // A reviewed editorial window the research also finds: it must not be proposed again.
  await db.pool.query(
    `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, confidence,
       source, sourced_on, reviewed_at)
     VALUES ($1, 'autumn-leaves', 'foliage', 'Autumn leaves peak', '2026-11-15', '2026-12-10',
             'typical', 'JNTO', '2026-09-01', now())`,
    [kyoto],
  );
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function queued() {
  const { rows } = await db.pool.query<{
    key: string;
    name: string;
    source: string;
    source_url: string;
    sourced_on: string;
    reviewed_at: Date | null;
  }>(
    `SELECT key, name, source, source_url, sourced_on::text, reviewed_at FROM season_events
      WHERE destination_id = $1 AND key LIKE 'web-%' ORDER BY key`,
    [kyoto],
  );
  return rows;
}

describe('season events research', () => {
  it('queues cited, unreviewed candidates from code-built searches, skipping known events', async () => {
    const run = deps(SEARCHES);
    const report = await runSeasonResearch(
      db.pool,
      run.deps,
      { destination: 'kyoto', month: MONTH },
      quietLogger,
    );

    // Only the destination, month and fixed topics leave for the search provider.
    expect(run.searchBodies.map((body) => body['query'])).toEqual(
      seasonResearchQueries({ place: 'Kyoto, Japan', month: MONTH }),
    );
    const searchedUrls = new Set(
      SEARCHES.flatMap((name) => {
        const file = JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8')) as {
          response: { body: { results: { url: string }[] } };
        };
        return file.response.body.results.map((result) => result.url);
      }),
    );
    expect(run.modelBodies[0]?.['model']).toBe('deepseek-flash');

    const rows = await queued();
    expect(report).toEqual({ month: MONTH, destinations: 1, candidates: 9, queued: 8 });
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row.reviewed_at).toBeNull();
      expect(searchedUrls.has(row.source_url)).toBe(true);
      expect(row.source).toBe(`web: ${new URL(row.source_url).hostname.replace(/^www\./u, '')}`);
      expect(row.sourced_on).toBe('2026-09-28');
    }
    const names = rows.map((row) => row.name);
    expect(names).toContain('Autumn Foliage Peak in Kyoto');
    expect(names).not.toContain('Autumn Leaves Peak in Kyoto');
  });

  it('queues nothing new when the same month is researched again', async () => {
    const before = await queued();
    const report = await runSeasonResearch(
      db.pool,
      deps(SEARCHES).deps,
      { destination: 'kyoto', month: MONTH },
      quietLogger,
    );
    expect(report.queued).toBe(0);
    expect(await queued()).toEqual(before);
  });

  it('never shows a queued candidate to the app before review', async () => {
    const visible = await withUser(db.pool, crypto.randomUUID(), crypto.randomUUID(), (tx) =>
      tx.query("SELECT key FROM season_events WHERE key LIKE 'web-%'"),
    );
    expect(visible.rows).toEqual([]);
    const editorial = await withUser(db.pool, crypto.randomUUID(), crypto.randomUUID(), (tx) =>
      tx.query("SELECT key FROM season_events WHERE key = 'autumn-leaves'"),
    );
    expect(editorial.rows).toHaveLength(1);
  });

  it('drops a candidate whose cited page was not among the searched results', async () => {
    // Every topic answered by the first recording: events citing the other pages lose their source.
    const run = deps([SEARCHES[0] ?? '', SEARCHES[0] ?? '', SEARCHES[0] ?? '']);
    const candidates = await researchSeasonEvents(run.deps, {
      place: 'Kyoto, Japan',
      month: MONTH,
    });
    const firstUrls = new Set(
      (
        JSON.parse(readFileSync(path.join(FIXTURES, `${SEARCHES[0] ?? ''}.json`), 'utf8')) as {
          response: { body: { results: { url: string }[] } };
        }
      ).response.body.results.map((result) => result.url),
    );
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThan(9);
    for (const candidate of candidates) expect(firstUrls.has(candidate.source_url)).toBe(true);
  });

  it('keeps going when one destination fails, and reports nothing queued for it', async () => {
    const warnings: string[] = [];
    const logger: JobLogger = {
      ...quietLogger,
      warn: (_fields, message) => warnings.push(message),
    };
    const report = await runSeasonResearch(
      db.pool,
      deps([]).deps,
      { destination: 'kyoto', month: MONTH },
      logger,
    );
    expect(report).toMatchObject({ destinations: 1, candidates: 0, queued: 0 });
    expect(warnings).toEqual(['season research failed']);
  });
});
