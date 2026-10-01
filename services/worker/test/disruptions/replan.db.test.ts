/**
 * The weather replan against a migrated Postgres: rain from 12:00 to 15:00 over the ridge walk at
 * 13:00 (Bali) becomes the guide's proposed ChangeSet (trigger weather) moving it to 15:00, with the
 * rain band for 3e-2; the same forecast again changes nothing; accepting it resolves the
 * suggestion; and a suggestion the crew dismissed is not made again for that day. Words are the
 * templates (no model here).
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runReplan, settleSuggestions } from '../../src/jobs/disruptions/weather-replan';
import { buildGuidePlan, type GuidePlanFixture } from '../guide-actions/plan-fixture';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let fx: GuidePlanFixture;
let walk: string;

const writer = (_guide: string | null, facts: Readonly<Record<string, string | number>>) =>
  Promise.resolve({
    headline: `Rain till ${String(facts['rain_until'])}. Move ${String(facts['title'])}?`,
    detail: `${String(facts['rain_pct'])}% chance of rain at ${String(facts['from'])}.`,
    lines: { move: `${String(facts['title'])} ${String(facts['from'])} → ${String(facts['to'])}` },
    fallbackUsed: true,
  });

async function suggestion() {
  const { rows } = await harness.pool.query<{
    status: string;
    facts: Record<string, unknown>;
    change_set_id: string;
    title: string;
  }>(
    "SELECT status, facts, change_set_id, title FROM disruptions WHERE trip_id = $1 AND kind = 'weather' ORDER BY created_at DESC LIMIT 1",
    [fx.tripId],
  );
  return rows[0];
}

beforeAll(async () => {
  harness = await startJobsHarness();
  fx = await buildGuidePlan(harness.pool, { inTrip: true, now: new Date() });
  const destination = await harness.pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, tz) VALUES ('bali-replan', 'Bali', 'Asia/Makassar') RETURNING id",
  );
  const destinationId = destination.rows[0]?.id as string;
  await harness.pool.query(
    "UPDATE trips SET destination_id = $2, tz = 'Asia/Makassar' WHERE id = $1",
    [fx.tripId, destinationId],
  );
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    at: new Date(`2027-03-10T${String(hour).padStart(2, '0')}:00:00+08:00`).toISOString(),
    temp_c: 28,
    chance_of_rain: hour >= 12 && hour < 15 ? 80 : 10,
    precip_mm: 0,
    wind_kph: 8,
    gust_kph: 12,
    uv: 6,
    code: 1000,
    is_day: true,
  }));
  await harness.pool.query(
    `INSERT INTO weather_snapshots (destination_id, point_key, lat, lng, elevation_m, date, hourly,
       source, fetched_at, checked_at)
     VALUES ($1, 'centroid', -8.5, 115.26, 200, '2027-03-10', $2, 'weatherapi', now(), now())`,
    [
      destinationId,
      JSON.stringify({
        day: {
          max_temp_c: 30,
          min_temp_c: 24,
          chance_of_rain: 80,
          precip_mm: 6,
          uv: 6,
          code: 1183,
        },
        hours,
      }),
    ],
  );
  const { rows } = await harness.pool.query<{ stable_id: string }>(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, category,
       is_outdoor, notes, created_by_kind)
     SELECT version_id, day_id, trip_id, gen_random_uuid(), '2027-03-10T13:00:00+08:00',
            '2027-03-10T14:30:00+08:00', 'Asia/Makassar', 'activity', true, 'Campuhan ridge walk', 'guide'
       FROM plan_items WHERE version_id = $1 LIMIT 1
     RETURNING stable_id`,
    [fx.versionId],
  );
  walk = rows[0]?.stable_id as string;
}, 240_000);

afterAll(async () => {
  await harness.close();
});

describe('ai.replan', () => {
  const job = () => ({ trip_id: fx.tripId, item_stable_id: walk });

  it('proposes moving the walk out of the rain as a weather ChangeSet', async () => {
    expect(await runReplan(harness.pool, job(), writer)).toBe('suggested');
    const found = await suggestion();
    expect(found).toMatchObject({
      status: 'open',
      title: 'Rain till 15:00. Move Campuhan ridge walk?',
      facts: { from: '13:00', to: '15:00', rain_from: '12:00', rain_until: '15:00', rain_pct: 80 },
    });
    const { rows } = await harness.pool.query<{
      trigger: string;
      status: string;
      ops: { after: { starts_at: string } }[];
    }>('SELECT trigger, status, ops FROM change_sets WHERE id = $1', [found?.change_set_id]);
    expect(rows[0]).toMatchObject({ trigger: 'weather', status: 'proposed' });
    expect(rows[0]?.ops[0]?.after.starts_at).toBe('2027-03-10T07:00:00.000Z');
    const band = await harness.pool.query(
      `SELECT 1 FROM rt_outbox WHERE channel = 'trip_plan:' || $1 AND payload->>'type' = 'forecast.band'`,
      [fx.tripId],
    );
    expect(band.rowCount).toBe(1);
  });

  it('changes nothing for the same forecast', async () => {
    expect(await runReplan(harness.pool, job(), writer)).toBe('unchanged');
  });

  it('resolves the suggestion once the crew accepts its ChangeSet', async () => {
    const found = await suggestion();
    await withSystem(harness.pool, (tx) =>
      settleSuggestions(tx, fx.tripId, found?.change_set_id ?? null),
    );
    expect((await suggestion())?.status).toBe('resolved');
  });

  it('does not suggest again for a day the crew dismissed', async () => {
    expect(await runReplan(harness.pool, job(), writer)).toBe('suggested');
    await harness.pool.query(
      `UPDATE disruptions SET status = 'withdrawn', resolved_at = now(),
              facts = facts || '{"dismissed": "yes"}'::jsonb
        WHERE trip_id = $1 AND kind = 'weather' AND status = 'open'`,
      [fx.tripId],
    );
    expect(await runReplan(harness.pool, job(), writer)).toBe('dismissed');
  });
});
