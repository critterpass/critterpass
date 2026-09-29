import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway } from '@cp/ai';
import { createPool, runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CURATED_BUCKETS, selectCurated, selectionCandidates } from '../src/kinds/places/select';
import { replayFetch } from './fixture-fetch';
import { seedSelectFixture } from './places-select-fixture';

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let destinationId: string;

beforeAll(async () => {
  container = await startPostgres();
  pool = createPool(container.getConnectionUri());
  await runMigrations(pool);
  destinationId = await seedSelectFixture(pool);
}, 240_000);

afterAll(async () => {
  await pool.end();
  await container.stop();
});

const namesOf = async (ids: readonly string[]) =>
  (
    await pool.query<{ name: string }>('SELECT name FROM pois WHERE id = ANY($1::uuid[])', [ids])
  ).rows
    .map((row) => row.name)
    .sort();

describe('curated POI selection', () => {
  it('leaves chains out and puts places both datasets list first', async () => {
    const food = await selectionCandidates(pool, destinationId, ['food', 'market']);
    expect(food.map((c) => c.name)).toEqual(['Nishiki Market']);
    const all = await selectionCandidates(
      pool,
      destinationId,
      CURATED_BUCKETS.flatMap((bucket) => bucket.categories),
    );
    const firstLoose = all.findIndex((c) => !c.corroborated);
    expect(
      all
        .slice(0, firstLoose)
        .map((c) => c.name)
        .sort(),
    ).toEqual(['Kinkaku-ji', 'Kyoto Station', 'Nishiki Market']);
    expect(all.slice(firstLoose).every((c) => !c.corroborated)).toBe(true);
  });

  it('keeps the places the model scores highest and answers a rerun from the cache', async () => {
    const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'factory-select-'));
    const replay = replayFetch(['deepseek-places-select-kyoto']);
    const gateway = createGateway({ apiKey: 'test-key', fetch: replay.fetch, maxAttempts: 1 });
    const options = { gateway, maxCostMicros: 1_000_000, cacheDir };
    const ids = await selectCurated(pool, { id: destinationId, slug: 'kyoto' }, 6, options);
    expect(replay.requests).toHaveLength(1);
    expect(await namesOf(ids)).toEqual([
      'Arashiyama Bamboo Grove',
      'Fushimi Inari Taisha',
      'Hanamikoji Street',
      'Kinkaku-ji',
      'Nishiki Market',
      'Pontocho Alley',
    ]);
    const again = await selectCurated(pool, { id: destinationId, slug: 'kyoto' }, 6, {
      ...options,
      gateway: createGateway({ apiKey: 'test-key', fetch: replayFetch([]).fetch, maxAttempts: 1 }),
    });
    expect(again.sort()).toEqual([...ids].sort());
  });

  it('takes every candidate without calling the model when the city has no more than its target', async () => {
    const ids = await selectCurated(pool, { id: destinationId, slug: 'kyoto' }, 50, {
      gateway: null,
      maxCostMicros: 0,
    });
    expect(ids).toHaveLength(13);
  });
});
