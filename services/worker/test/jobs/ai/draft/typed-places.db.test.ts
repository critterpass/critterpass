/**
 * The draft's places with the server key `planner.typed_places` off and on, read from a migrated
 * Postgres: off, a place carries only the editors' text (as before); on, it carries its ready
 * profile's typed facts, its kind's where it has no ready profile, and the editors' visit length
 * over both.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadDraftPlaces, TYPED_PLACES_KEY } from '../../../../src/jobs/ai/draft/load-places';
import { startJobsHarness, type JobsHarness } from '../../../helpers/jobs-harness';

let harness: JobsHarness;
let city: string;
const ids = new Map<string, string>();

beforeAll(async () => {
  harness = await startJobsHarness();
  await withSystem(harness.pool, async (tx) => {
    city = (
      await tx.query<{ id: string }>(
        `INSERT INTO destinations (slug, name, country, tz, currency)
         VALUES ('typed-town', 'Typed Town', 'Vietnam', 'Asia/Ho_Chi_Minh', 'VND') RETURNING id`,
      )
    ).rows[0]?.id as string;
    const add = async (name: string, category: string, editorial: object) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation, editorial)
         VALUES ($1, $2, $3, 16.06, 108.22, 'editorial', $4) RETURNING id`,
        [city, name, category, JSON.stringify(editorial)],
      );
      ids.set(name, rows[0]?.id as string);
    };
    await add('Night Bar', 'nightlife', { best_time: 'After dark', why_go: 'The view.' });
    await add('Noodle House', 'food', { best_time: 'Lunch', time_needed_min: 40 });
    await add('Old Pagoda', 'temple_shrine', { essential: true, best_time: 'Early morning' });
    await add('Pending Park', 'nature', { best_time: 'Sunset' });
    const profile = (name: string, status: string, facts: string) =>
      tx.query(
        `INSERT INTO place_profiles (poi_id, status, best_times, visit_min, meal_role, dish)
         VALUES ($1, $2, ${facts})`,
        [ids.get(name), status],
      );
    await profile('Night Bar', 'ready', `'{evening,after_dark}', 90, 'none', NULL`);
    await profile('Noodle House', 'ready', `'{midday}', 60, 'meal', 'mì quảng'`);
    await profile('Pending Park', 'pending', `'{sunset}', 300, 'none', NULL`);
  });
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

const setKey = (value: boolean) =>
  withSystem(harness.pool, (tx) =>
    tx.query(
      `INSERT INTO ops.ops_config (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [TYPED_PLACES_KEY, JSON.stringify(value)],
    ),
  );

const byName = async () =>
  new Map((await loadDraftPlaces(harness.pool, city, [])).map((poi) => [poi.name, poi]));

describe('draft places and the typed places key', () => {
  it('carries only the editors’ text while the key is off', async () => {
    await setKey(false);
    const places = await byName();
    expect(places.get('Night Bar')?.bestTime).toBe('After dark');
    expect(places.get('Night Bar')?.bestTimes).toBeUndefined();
    expect(places.get('Noodle House')?.mealRole).toBeUndefined();
  });

  it('carries the profile, else the kind, while the key is on', async () => {
    await setKey(true);
    const places = await byName();
    expect(places.get('Night Bar')).toMatchObject({
      bestTimes: ['evening', 'after_dark'],
      visitMin: 90,
      durationMin: 90,
      mealRole: 'none',
    });
    // The editors' visit length wins over the profile's.
    expect(places.get('Noodle House')).toMatchObject({
      bestTimes: ['midday'],
      visitMin: 40,
      mealRole: 'meal',
      dish: 'mì quảng',
    });
    // No profile, and a profile not ready yet: the kind's facts.
    expect(places.get('Old Pagoda')).toMatchObject({ bestTimes: [], essentialRank: 1 });
    expect(places.get('Pending Park')).toMatchObject({ bestTimes: [], visitMin: 150 });
    await setKey(false);
  });
});
