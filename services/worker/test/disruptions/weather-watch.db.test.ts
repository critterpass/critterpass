/**
 * The forecast watcher against a migrated Postgres: a rough-seas forecast for Friday's boat puts it
 * on PLAN B and escalates exactly once (plan-changing), the same forecast again changes and sends
 * nothing, and calm seas bring it back to GO without a ping. Forecasts are stored the way the
 * weather refresh stores WeatherAPI's answers; the words are the templates (no model here).
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { watchWriter } from '../../src/jobs/disruptions/watch-notify';
import { watchTrip } from '../../src/jobs/disruptions/weather-watch';
import type { WatchedTrip } from '../../src/jobs/disruptions/watch-score';
import { buildGuidePlan } from '../guide-actions/plan-fixture';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

const NOW = new Date('2026-10-14T00:00:00Z');
let harness: JobsHarness;
let trip: WatchedTrip;

function forecast(waveM: number, windKph: number) {
  const hours = [0, 1, 2, 3, 4, 5, 6].map((h) => `2026-10-16T0${h}:00:00Z`);
  return {
    hourly: {
      day: { max_temp_c: 31, min_temp_c: 25, chance_of_rain: 10, precip_mm: 0, uv: 8, code: 1000 },
      hours: hours.map((at) => ({
        at,
        temp_c: 29,
        chance_of_rain: 10,
        precip_mm: 0,
        wind_kph: windKph,
        gust_kph: windKph,
        uv: 7,
        code: 1000,
        is_day: true,
      })),
    },
    marine: {
      hours: hours.map((at) => ({
        at,
        wave_m: waveM,
        swell_m: waveM,
        swell_period_s: 9,
        water_temp_c: 28,
      })),
      tides: null,
    },
  };
}

async function setForecast(waveM: number, windKph: number): Promise<void> {
  const { hourly, marine } = forecast(waveM, windKph);
  await harness.pool.query(
    `INSERT INTO weather_snapshots (destination_id, point_key, lat, lng, elevation_m, date, hourly,
       marine, marine_fetched_at, source, fetched_at, checked_at)
     VALUES ($1, 'centroid', -8.65, 115.2, 0, '2026-10-16', $2, $3, now(), 'weatherapi', now(), now())
     ON CONFLICT (destination_id, point_key, date, source)
       DO UPDATE SET hourly = EXCLUDED.hourly, marine = EXCLUDED.marine`,
    [trip.destinationId, JSON.stringify(hourly), JSON.stringify(marine)],
  );
}

const run = () =>
  withSystem(harness.pool, (tx) => watchTrip(tx, trip, NOW, watchWriter(undefined)));

async function escalations(): Promise<{ status: string; plan_changing: boolean }[]> {
  const { rows } = await harness.pool.query<{
    payload: { status: string; plan_changing: boolean };
  }>(
    "SELECT payload FROM domain_events WHERE type = 'watch.escalated' AND trip_id = $1 ORDER BY occurred_at",
    [trip.id],
  );
  return rows.map((row) => row.payload);
}

beforeAll(async () => {
  harness = await startJobsHarness();
  const fx = await buildGuidePlan(harness.pool, { inTrip: true, now: NOW });
  const destination = await harness.pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, tz) VALUES ('bali-watch', 'Bali', 'Asia/Makassar') RETURNING id",
  );
  const destinationId = destination.rows[0]?.id as string;
  await harness.pool.query(
    `UPDATE trips SET destination_id = $2, tz = 'Asia/Makassar', start_date = '2026-10-13',
       end_date = '2026-10-20' WHERE id = $1`,
    [fx.tripId, destinationId],
  );
  await harness.pool.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, category,
       is_outdoor, notes, created_by_kind)
     SELECT version_id, day_id, trip_id, gen_random_uuid(), '2026-10-16T01:00:00Z',
            '2026-10-16T05:00:00Z', tz, 'boat', true, 'Nusa Penida boat', 'guide'
       FROM plan_items WHERE version_id = $1 LIMIT 1`,
    [fx.versionId],
  );
  trip = { id: fx.tripId, crewId: fx.crewId, destinationId, tz: 'Asia/Makassar', guide: null };
}, 240_000);

afterAll(async () => {
  await harness.close();
});

describe('weather.watch', () => {
  it('puts the boat on PLAN B on rough seas and escalates exactly once', async () => {
    await setForecast(2.5, 35);
    expect(await run()).toEqual({ changed: 1, escalated: 1 });
    const { rows } = await harness.pool.query<{ status: string; kind: string; title: string }>(
      'SELECT status, kind, title FROM watch_items WHERE trip_id = $1',
      [trip.id],
    );
    expect(rows).toEqual([
      { status: 'plan_b', kind: 'marine', title: 'Nusa Penida boat · waves 2.5 m' },
    ]);
    const [escalation, ...more] = await escalations();
    expect(more).toEqual([]);
    expect(escalation).toMatchObject({ trip_id: trip.id, status: 'plan_b', plan_changing: true });
  });

  it('sends nothing for the same forecast again', async () => {
    expect(await run()).toEqual({ changed: 0, escalated: 0 });
    expect(await escalations()).toHaveLength(1);
  });

  it('goes back to GO on calm seas without a ping', async () => {
    await setForecast(0.7, 10);
    expect(await run()).toEqual({ changed: 1, escalated: 0 });
    const { rows } = await harness.pool.query<{ status: string }>(
      'SELECT status FROM watch_items WHERE trip_id = $1',
      [trip.id],
    );
    expect(rows).toEqual([{ status: 'go' }]);
    expect(await escalations()).toHaveLength(1);
  });
});
