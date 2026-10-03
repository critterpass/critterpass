/**
 * The open-data fields the ingest keeps (confidence, website, phone, brand) against real Postgres:
 * merged per field on a conflated pair, refreshed on a rerun, and the rule that a new low-confidence
 * Overture-only place is not inserted while a stored one is still updated and never removed, and a
 * place another destination owns is left alone.
 */
import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ingestDestination, type BoundingBox, type PlaceSourceRow } from '../../src/places/ingest';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let destinationId: string;

const HOI_AN_BBOX: BoundingBox = { minLat: 15.86, maxLat: 15.89, minLng: 108.3, maxLng: 108.36 };

function readers(overture: readonly PlaceSourceRow[], fsq: readonly PlaceSourceRow[] = []) {
  return {
    readOverturePlaces: () => Promise.resolve(overture),
    readFsqOsPlaces: () => Promise.resolve(fsq),
  };
}

interface StoredRow {
  readonly name: string;
  readonly confidence: number | null;
  readonly website: string | null;
  readonly phone: string | null;
  readonly brand: string | null;
}

async function storedRows(): Promise<StoredRow[]> {
  const { rows } = await pool.query<StoredRow>(
    'SELECT name, confidence, website, phone, brand FROM pois WHERE destination_id = $1 ORDER BY name',
    [destinationId],
  );
  return rows;
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({
    connectionString: postgres.getConnectionUri(),
    connectionTimeoutMillis: 2000,
  });
  await runMigrations(pool);
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

beforeEach(async () => {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage) VALUES ($1, 'Hội An', 'live') RETURNING id",
    [`hoi-an-${Date.now()}-${Math.random().toString(36).slice(2)}`],
  );
  destinationId = rows[0]!.id;
});

const japaneseBridge: PlaceSourceRow = {
  sourceId: 'overture-bridge',
  name: 'Japanese Covered Bridge',
  categoryLabels: ['landmark_and_historical_building'],
  lat: 15.8771,
  lng: 108.3259,
  confidence: 0.92,
  website: 'https://overture.example/bridge',
  brand: undefined,
};

describe('ingest open-data fields', () => {
  it('keeps FSQ contact details on a match and Overture confidence and brand', async () => {
    const overture: PlaceSourceRow[] = [
      {
        sourceId: 'overture-highlands',
        name: 'Highlands Coffee',
        categoryLabels: ['coffee_shop'],
        lat: 15.8779,
        lng: 108.3301,
        confidence: 0.81,
        website: 'https://overture.example/highlands',
        phone: '+84 1',
        brand: 'Highlands Coffee',
      },
      japaneseBridge,
    ];
    const fsq: PlaceSourceRow[] = [
      {
        sourceId: 'fsq-highlands',
        name: 'Highlands Coffee',
        categoryLabels: ['Coffee Shop'],
        lat: 15.878,
        lng: 108.3302,
        phone: '+84 235 111 222',
      },
    ];

    await ingestDestination(pool, { destinationId, bbox: HOI_AN_BBOX }, readers(overture, fsq));

    const rows = await storedRows();
    expect(rows).toEqual([
      {
        name: 'Highlands Coffee',
        confidence: expect.closeTo(0.81, 5) as number,
        website: 'https://overture.example/highlands',
        phone: '+84 235 111 222',
        brand: 'Highlands Coffee',
      },
      {
        name: 'Japanese Covered Bridge',
        confidence: expect.closeTo(0.92, 5) as number,
        website: 'https://overture.example/bridge',
        phone: null,
        brand: null,
      },
    ]);
  });

  it('refreshes the fields on a rerun', async () => {
    await ingestDestination(pool, { destinationId, bbox: HOI_AN_BBOX }, readers([japaneseBridge]));
    await ingestDestination(
      pool,
      { destinationId, bbox: HOI_AN_BBOX },
      readers([{ ...japaneseBridge, confidence: 0.95, website: undefined, phone: '+84 9' }]),
    );

    const [row] = await storedRows();
    expect(row).toMatchObject({ confidence: expect.closeTo(0.95, 5) as number, website: null });
    expect(row?.phone).toBe('+84 9');
  });

  it('leaves out a new low-confidence Overture-only place but keeps FSQ-linked ones', async () => {
    const junk: PlaceSourceRow = {
      sourceId: 'overture-junk',
      name: 'Review Hội An',
      categoryLabels: ['real_estate_service'],
      lat: 15.879,
      lng: 108.331,
      confidence: 0.12,
    };
    const lowButMatched: PlaceSourceRow = {
      sourceId: 'overture-banh-mi',
      name: 'Bánh Mì Phượng',
      categoryLabels: ['sandwich_shop'],
      lat: 15.8791,
      lng: 108.3335,
      confidence: 0.2,
    };
    const fsq: PlaceSourceRow[] = [
      { ...lowButMatched, sourceId: 'fsq-banh-mi', categoryLabels: ['Sandwich Spot'] },
    ];

    const result = await ingestDestination(
      pool,
      { destinationId, bbox: HOI_AN_BBOX },
      readers([junk, lowButMatched, japaneseBridge], fsq),
    );

    expect(result).toMatchObject({ inserted: 2, updated: 0, skipped: 1, upserted: 2 });
    expect((await storedRows()).map((row) => row.name)).toEqual([
      'Bánh Mì Phượng',
      'Japanese Covered Bridge',
    ]);
  });

  it('updates a stored place whose confidence drops, without removing it', async () => {
    await ingestDestination(pool, { destinationId, bbox: HOI_AN_BBOX }, readers([japaneseBridge]));
    const result = await ingestDestination(
      pool,
      { destinationId, bbox: HOI_AN_BBOX },
      readers([{ ...japaneseBridge, confidence: 0.1 }]),
    );

    expect(result).toMatchObject({ inserted: 0, updated: 1, skipped: 0 });
    const { rows } = await pool.query<{ status: string; confidence: number }>(
      'SELECT status, confidence FROM pois WHERE destination_id = $1',
      [destinationId],
    );
    expect(rows).toEqual([{ status: 'active', confidence: expect.closeTo(0.1, 5) as number }]);
  });

  it('leaves a place another destination owns untouched', async () => {
    const owner = destinationId;
    await ingestDestination(
      pool,
      { destinationId: owner, bbox: HOI_AN_BBOX },
      readers([japaneseBridge]),
    );
    const { rows: created } = await pool.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, coverage) VALUES ($1, 'Inner', 'live') RETURNING id",
      [`inner-${Date.now()}-${Math.random().toString(36).slice(2)}`],
    );
    const renamed = { ...japaneseBridge, name: 'Chùa Cầu', confidence: 0.5 };

    const result = await ingestDestination(
      pool,
      { destinationId: created[0]!.id, bbox: HOI_AN_BBOX },
      readers([renamed]),
    );

    expect(result).toMatchObject({ inserted: 0, updated: 0, skipped: 0, ownedElsewhere: 1 });
    const { rows } = await pool.query<{ destination_id: string; name: string; confidence: number }>(
      "SELECT destination_id, name, confidence FROM pois WHERE source_ids ->> 'overture' = $1",
      [japaneseBridge.sourceId],
    );
    expect(rows).toEqual([
      {
        destination_id: owner,
        name: 'Japanese Covered Bridge',
        confidence: expect.closeTo(0.92, 5) as number,
      },
    ]);
  });
});
