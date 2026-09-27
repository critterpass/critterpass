/**
 * The forecast watcher over a migrated Postgres: a Bali trip's outdoor hike tipping into rain
 * emits one `forecast.changed`; comparing the same forecast again emits none; a boat trip gets
 * waves from the centroid's sea conditions; items elsewhere on the island are left to their cell.
 */
import { withSystem } from '@cp/db';
import { TRAVEL_DESTINATIONS, type MarineHour, type WeatherHour } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { emitForecastChanges, type PointForecast } from '../../src/travel-data/forecast-watch';
import { insertCrew, insertUser, startNotifyDb, type NotifyDb } from '../notify-fixtures';
import { insertLiveDestinations, insertTripWithPlan } from './travel-fixtures';

let db: NotifyDb;
let bali: string;
let tripId: string;
let hike: string;
let boat: string;
let batur: string;
const BASE = Date.parse('2026-10-02T00:00:00Z');
const at = (hour: number) => new Date(BASE + hour * 3_600_000);
const travel = TRAVEL_DESTINATIONS['bali']!;

function hours(rain: (hour: number) => number): WeatherHour[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    at: at(hour).toISOString(),
    temp_c: 27,
    chance_of_rain: rain(hour),
    precip_mm: 0,
    wind_kph: 8,
    gust_kph: 12,
    uv: 5,
    code: 1000,
    is_day: true,
  }));
}

function sea(wave: (hour: number) => number): MarineHour[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    at: at(hour).toISOString(),
    wave_m: wave(hour),
    swell_m: 1,
    swell_period_s: 12,
    water_temp_c: null,
  }));
}

beforeAll(async () => {
  db = await startNotifyDb();
  bali = (await insertLiveDestinations(db.pool))['bali'] ?? '';
  const traveller = await insertUser(db.pool);
  const crewId = await insertCrew(db.pool, [traveller]);
  const poi = async (name: string, lat: number, lng: number) =>
    (
      await db.pool.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, $2, 'nature', $3, $4)
         RETURNING id`,
        [bali, name, lat, lng],
      )
    ).rows[0]?.id ?? '';
  const trip = await insertTripWithPlan(db.pool, {
    crewId,
    destinationId: bali,
    status: 'pre_trip',
    items: [
      {
        category: 'hike',
        isOutdoor: true,
        startsAt: at(1),
        poiId: await poi('Campuhan Ridge', -8.5031, 115.2544),
      },
      { category: 'boat', isOutdoor: true, startsAt: at(5) },
      {
        category: 'hike',
        isOutdoor: true,
        startsAt: at(1),
        poiId: await poi('Mount Batur', -8.242, 115.375),
      },
    ],
  });
  tripId = trip.tripId;
  [hike = '', boat = '', batur = ''] = trip.stableIds;
}, 240_000);

afterAll(async () => {
  await db.stop();
});

const watch = (before: PointForecast, after: PointForecast, pointKey = 'centroid') =>
  withSystem(db.pool, (tx) =>
    emitForecastChanges(tx, { destinationId: bali, travel, pointKey, before, after }),
  );

async function events() {
  const { rows } = await db.pool.query<{ payload: { changes: unknown[]; impact: number } }>(
    "SELECT payload FROM domain_events WHERE type = 'forecast.changed' ORDER BY occurred_at",
  );
  return rows.map((row) => row.payload);
}

describe('emitForecastChanges', () => {
  const dry = { weather: hours(() => 10), marine: sea(() => 0.8) };

  it('emits one event when rain reaches 50 % on the centroid hike', async () => {
    const wet = { weather: hours((hour) => (hour === 1 ? 60 : 10)), marine: sea(() => 0.8) };
    expect(await watch(dry, wet)).toBe(1);
    expect(await events()).toEqual([
      {
        trip_id: tripId,
        destination_id: bali,
        changes: [{ item_stable_id: hike, reason: 'rain', date: '2026-10-02' }],
        impact: 50,
      },
    ]);
    // Same forecast compared again: nothing new.
    expect(await watch(wet, wet)).toBe(0);
    expect(await events()).toHaveLength(1);
  });

  it('reports waves for the boat trip from the centroid sea conditions', async () => {
    const rough = { weather: hours(() => 10), marine: sea((hour) => (hour >= 5 ? 2.4 : 0.8)) };
    expect(await watch(dry, rough)).toBe(1);
    const last = (await events()).at(-1);
    expect(last?.changes).toEqual([{ item_stable_id: boat, reason: 'waves', date: '2026-10-02' }]);
  });

  it("leaves the Batur hike to its own cell's forecast", async () => {
    const wet = { weather: hours(() => 90), marine: sea(() => 0.8) };
    expect(await watch(dry, wet, 'g:-8.2,115.4')).toBe(1);
    const last = (await events()).at(-1);
    expect(last?.changes).toEqual([{ item_stable_id: batur, reason: 'rain', date: '2026-10-02' }]);
  });
});
