/**
 * Climate normals from recorded WeatherAPI history (Ubud, ten October days in each of 2023-2025):
 * October's usual chance of rain peaks in the afternoon, a month without enough history is not
 * stored, and a second run spends calls only on the months still missing.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createSupplierHttp } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fillClimateNormals } from '../../src/jobs/planning/climate';
import { cellOf, sampleDates } from '../../src/jobs/planning/climate/normals';
import { fetchHistory } from '../../src/travel-data/weatherapi-client';
import { silentLogger, startNotifyDb, type NotifyDb } from '../notify-fixtures';
import { insertLiveDestinations } from '../travel-data/travel-fixtures';

const RECORDED = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      '../../src/jobs/planning/climate/fixtures/history-bali-october.json',
    ),
    'utf8',
  ),
) as Record<string, unknown>;

const NOW = new Date('2026-10-04T03:00:00Z');
let db: NotifyDb;
let bali: string;
const calls: string[] = [];

const http = createSupplierHttp({
  audit: () => Promise.resolve(),
  sleep: () => Promise.resolve(),
  fetch: (input) => {
    const url = new URL(input);
    const date = url.searchParams.get('dt') ?? '';
    calls.push(date);
    const body = RECORDED[date];
    return Promise.resolve(
      body === undefined
        ? new Response(JSON.stringify({ error: { code: 1008, message: 'no data' } }), {
            status: 400,
          })
        : new Response(JSON.stringify(body), { status: 200 }),
    );
  },
});
const history = (query: { lat: number; lng: number; date: string }) =>
  fetchHistory(http, { key: 'test-key' }, query);

beforeAll(async () => {
  db = await startNotifyDb();
  bali = (await insertLiveDestinations(db.pool))['bali'] ?? '';
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('climate normals', () => {
  it('samples ten days of the month in each of the last three years', () => {
    const dates = sampleDates(10, NOW);
    expect(dates).toHaveLength(30);
    expect(dates.every((date) => Object.hasOwn(RECORDED, date))).toBe(true);
    expect(cellOf({ lat: -8.5069, lng: 115.2625 })).toBe('-8.6,115.2');
  });

  it('stores October for Bali with its afternoon peak, and skips months with no history', async () => {
    const report = await fillClimateNormals({
      pool: db.pool,
      history,
      logger: silentLogger,
      destinationId: bali,
      now: NOW,
    });
    expect(report).toEqual({ written: 1, skipped: 11, remaining: 0 });
    const { rows } = await db.pool.query<{ rain_pct: number[]; years: number; cell: string }>(
      'SELECT rain_pct, years, cell FROM climate_normals WHERE destination_id = $1 AND month = 10',
      [bali],
    );
    const row = rows[0];
    expect(row?.cell).toBe('-8.6,115.2');
    expect(row?.years).toBe(3);
    const pct = row?.rain_pct ?? [];
    const morning = Math.max(...pct.slice(6, 9));
    const afternoon = Math.max(...pct.slice(13, 17));
    expect(morning).toBeLessThan(20);
    expect(afternoon).toBeGreaterThanOrEqual(50);
  });

  it('a second run spends history calls only on the months still missing', async () => {
    calls.length = 0;
    await fillClimateNormals({
      pool: db.pool,
      history,
      logger: silentLogger,
      destinationId: bali,
      now: NOW,
    });
    expect(calls.some((date) => date.slice(5, 7) === '10')).toBe(false);
    const { rows } = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM climate_normals WHERE destination_id = $1',
      [bali],
    );
    expect(rows[0]?.n).toBe(1);
  });
});
