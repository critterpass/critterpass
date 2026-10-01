import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway, createTavilySearch } from '@cp/ai';
import { createPool, runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  poisWithoutHours,
  researchHours,
  storeProposals,
  toProposal,
} from '../src/kinds/places/hours';
import { replayFetch } from './fixture-fetch';
import { seedFixturePois } from './places-fixture';

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;

beforeAll(async () => {
  container = await startPostgres();
  pool = createPool(container.getConnectionUri());
  await runMigrations(pool);
  await seedFixturePois(pool);
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('opening hours research', () => {
  it('proposes cited hours from official pages and leaves the POIs untouched', async () => {
    const candidates = await poisWithoutHours(pool, ['bali']);
    expect(candidates.map((c) => c.name)).toEqual([
      'Pura Luhur Uluwatu',
      'Tegallalang Rice Terrace',
      'Ubud Art Market',
      'Uluwatu Temple',
    ]);
    const search = replayFetch([
      'tavily-hours-1',
      'tavily-hours-2',
      'tavily-hours-3',
      'tavily-hours-4',
    ]);
    const model = replayFetch([
      'deepseek-hours-1',
      'deepseek-hours-2',
      'deepseek-hours-3',
      'deepseek-hours-4',
    ]);
    const proposals = await researchHours(candidates, {
      search: createTavilySearch({ apiKey: 'test-key', fetch: search.fetch }),
      gateway: createGateway({ apiKey: 'test-key', fetch: model.fetch, maxAttempts: 1 }),
      now: new Date('2026-09-28T00:00:00Z'),
      cacheDir: mkdtempSync(path.join(os.tmpdir(), 'hours-')),
    });
    expect(proposals).toHaveLength(4);
    const market = proposals.find((p) => p.poiId === candidates[2]!.id);
    expect(market?.sourceUrl).toBe('https://www.ubudcenter.com/ubud-art-market');
    expect(market?.hours.weekly.mo).toEqual([{ start: '08:00', end: '18:00' }]);

    await storeProposals(pool, 'hours-test', proposals);
    const pois = await pool.query<{ hours: unknown; verified: Date | null }>(
      'SELECT hours, hours_verified_at AS verified FROM pois',
    );
    expect(
      pois.rows.every((row) => JSON.stringify(row.hours) === '{}' && row.verified === null),
    ).toBe(true);
    expect(await poisWithoutHours(pool, ['bali'])).toEqual([]);
  });

  it('drops hours whose source is not one of the results', () => {
    const candidate = {
      poiId: 'x',
      name: 'X',
      destination: 'bali',
      hits: [{ url: 'https://a.example', title: 'A', content: '' }],
    };
    const output = {
      found: true,
      source_url: 'https://made-up.example',
      weekly: {
        mo: [{ start: '08:00', end: '17:00' }],
        tu: [],
        we: [],
        th: [],
        fr: [],
        sa: [],
        su: [],
      },
      exceptions: [],
    };
    expect(toProposal(candidate, output, '2026-09-28T00:00:00Z')).toBeNull();
    expect(
      toProposal(candidate, { ...output, source_url: 'https://a.example' }, '2026-09-28T00:00:00Z')
        ?.hours,
    ).toEqual({
      weekly: { mo: [{ start: '08:00', end: '17:00' }] },
    });
  });
});
