import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway } from '@cp/ai';
import { createPool, runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { placesNetwork } from '../src/kinds/places/pois';
import { runPipeline } from '../src/pipeline';
import { stageFiles } from '../src/stages/state';
import { replayFetch } from './fixture-fetch';
import { seedFixturePois } from './places-fixture';

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;

beforeAll(async () => {
  container = await startPostgres();
  pool = createPool(container.getConnectionUri());
  await runMigrations(pool);
  await seedFixturePois(pool);
  process.env['DATABASE_URL'] = container.getConnectionUri();
  process.env['TYPESAFE_API_KEY'] = 'test-key';
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('curated places batch', () => {
  it('writes editorial from open data, merges a sure duplicate and keeps sources licensed', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'factory-places-'));
    placesNetwork.fetch = replayFetch(['jev-poi-duplicates']).fetch;
    const generation = replayFetch(['deepseek-places-bali']);
    const { report } = await runPipeline({
      kind: 'places',
      batchKey: 'bali-fixture',
      stages: ['brief', 'generate', 'validate'],
      pool: null,
      gateway: createGateway({ apiKey: 'test-key', fetch: generation.fetch, maxAttempts: 1 }),
      root,
      options: { destinations: 'bali' },
    });
    expect(generation.requests).toHaveLength(1);
    expect(report?.severity).not.toBe('fail');
    const items = stageFiles('places', 'bali-fixture', root).items() as {
      ref: string;
      licence: { source: string; licence: string };
      merge_into: string | null;
      editorial: { why_go: string };
    }[];
    expect(items).toHaveLength(4);
    expect(items.every((poi) => ['fsq_os', 'overture'].includes(poi.licence.source))).toBe(true);
    const merged = items.filter((poi) => poi.merge_into !== null);
    expect(merged.map((poi) => [poi.ref, poi.merge_into])).toEqual([
      ['overture:fixture-uluwatu-en', 'fsq_os:fixture-uluwatu'],
    ]);
    expect(report?.batch.map((p) => p.message)).toContain(
      'bali has 4 curated POIs; launch needs 250',
    );
  });
});
