import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway } from '@cp/ai';
import { createPool, runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pinnedPoiIds } from '../src/kinds/places/pins';
import { selectCurated, selectionCandidates } from '../src/kinds/places/select';
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
  await pool?.end();
  await container?.stop();
});

const namesOf = async (ids: readonly string[]) =>
  (
    await pool.query<{ name: string }>('SELECT name FROM pois WHERE id = ANY($1::uuid[])', [ids])
  ).rows
    .map((row) => row.name)
    .sort();

describe('curated POI selection', () => {
  it("leaves chains out, lists a bucket's first category first, then places both datasets list", async () => {
    const food = await selectionCandidates(pool, destinationId, ['food', 'market']);
    expect(food.map((c) => c.name)).toEqual(['Nishiki Market']);
    const sights = await selectionCandidates(pool, destinationId, ['museum', 'other']);
    expect(sights[0]?.name).toBe('Kyoto National Museum');
    expect(sights).toHaveLength(5);
    const temples = await selectionCandidates(pool, destinationId, ['temple_shrine']);
    expect(temples[0]).toMatchObject({ name: 'Kinkaku-ji', corroborated: true });
    expect(temples.slice(1).every((c) => !c.corroborated)).toBe(true);
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

  it('pins a named place outside the buckets, taking the record nearest the pin', async () => {
    const insert = `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids)
      VALUES ($1, $2, 'stay', $3, $4, $5) RETURNING id`;
    const near = await pool.query<{ id: string }>(insert, [
      destinationId,
      'Hotel Kanra Kyoto',
      35.0,
      135.7596,
      { fsq_os: 'sel-kanra' },
    ]);
    await pool.query(insert, [
      destinationId,
      'Hotel Kanra Kyoto',
      35.0052,
      135.7641,
      { overture: 'sel-o-kanra-far' },
    ]);
    const missing: string[] = [];
    const ids = await pinnedPoiIds(
      pool,
      destinationId,
      [
        { name: 'hotel kanra kyoto', lat: 35.0001, lng: 135.7597 },
        { name: 'Kinkaku-ji', lat: 35.0, lng: 135.0 },
      ],
      (line) => missing.push(line),
    );
    expect(ids).toEqual([near.rows[0]!.id]);
    expect(missing).toEqual(['pinned place not found near its point: Kinkaku-ji']);
  });
});
