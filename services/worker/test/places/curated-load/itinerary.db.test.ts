/**
 * Loading a destination's second-version curated places and its itinerary on a migrated Postgres,
 * from the researchers' Đà Lạt files: each line's planning facts reach its row's note (ranked
 * essentials flagged, pairs carrying rows), its busy windows replace an AI estimate curve but never
 * what crews saw, the itinerary is stored with each place's row and read back resolved (a merged
 * row as the one it went into, a closed or unmatched one by name only), a re-load replaces it, and
 * the draft planner takes the line's typed facts over the place's AI profile.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { destinationItinerary, withSystem } from '@cp/db';
import { busyWeek, readEditorialOverlay } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadDraftPlaces, TYPED_PLACES_KEY } from '../../../src/jobs/ai/draft/load-places';
import { parseJsonLines } from '../../../src/places/curated-load/files';
import {
  curatedItinerarySchema,
  loadCuratedItinerary,
  type CuratedItinerary,
} from '../../../src/places/curated-load/itinerary';
import { loadCuratedPlaces, type CuratedPlacesReport } from '../../../src/places/curated-load/load';
import {
  curatedNameKey,
  curatedPlaceRowSchema,
  type CuratedPlaceRow,
} from '../../../src/places/curated-load/rows';
import { startJobsHarness, type JobsHarness } from '../../helpers/jobs-harness';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const lines = parseJsonLines(
  readFileSync(join(FIXTURES, 'vn-da-lat.jsonl'), 'utf8'),
  curatedPlaceRowSchema,
);
const itinerary = curatedItinerarySchema.parse(
  JSON.parse(readFileSync(join(FIXTURES, 'vn-da-lat.itinerary.json'), 'utf8')),
);
/** A stop no row of ours carries. */
const UNMATCHED = 'Leon Bar';

let harness: JobsHarness;
let dalat: string;
let report: CuratedPlacesReport;
const ids = new Map<string, string>();

const lineOf = (name: string): CuratedPlaceRow => {
  const found = lines.rows.find((row) => row.name_en === name);
  if (found === undefined) throw new Error(`no line ${name}`);
  return found;
};
const placedOf = (loaded: CuratedPlacesReport) =>
  new Map(loaded.matched.map((m) => [curatedNameKey(m.name), m.poiId]));
const read = () => withSystem(harness.pool, (tx) => destinationItinerary(tx, dalat));
const curves = async (poiId: string) =>
  (
    await harness.pool.query<{ source: string; dow: number; hourly: number[] }>(
      'SELECT source, dow, hourly FROM crowd_forecasts WHERE poi_id = $1 ORDER BY source, dow',
      [poiId],
    )
  ).rows;

beforeAll(async () => {
  harness = await startJobsHarness();
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, tz, currency, coverage)
     VALUES ('vn-da-lat', 'Đà Lạt', 'Vietnam', 'Asia/Ho_Chi_Minh', 'VND', 'guest') RETURNING id`,
  );
  dalat = rows[0]!.id;
  for (const line of lines.rows.filter((row) => row.name_en !== UNMATCHED)) {
    const { rows: added } = await harness.pool.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [dalat, line.name_en, line.category, line.lat, line.lng],
    );
    ids.set(line.name_en, added[0]!.id);
  }
  // Enough open-data places that Đà Lạt is not sparse.
  await harness.pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     SELECT $1, 'filler ' || n, 'other', 11.5, 108.0 FROM generate_series(1, 20) AS n`,
    [dalat],
  );
  const hourly = (value: number) => Array.from({ length: 24 }, () => value);
  // An AI estimate for the lake, and what five crews saw at the Crazy House.
  await harness.pool.query(
    `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at)
     VALUES ($1, 0, $2, 'estimate', now())`,
    [ids.get('Xuan Huong Lake'), hourly(5)],
  );
  await harness.pool.query(
    `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at, crew_count)
     VALUES ($1, 6, $2, 'visits', now(), 5)`,
    [ids.get('Crazy House'), hourly(70)],
  );
  // An AI profile for the nem nướng house that says otherwise than the line.
  await harness.pool.query(
    `INSERT INTO place_profiles (poi_id, status, best_times, visit_min, meal_role, dish)
     VALUES ($1, 'ready', '{early_morning}', 20, 'light', 'iced coffee')`,
    [ids.get('Nem Nuong Ba Hung')],
  );
  report = await loadCuratedPlaces(harness.pool, 'vn-da-lat', lines.rows, { dryRun: false });
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('loading second-version curated places', () => {
  it('reads every line of the researchers’ file and writes each into its row', () => {
    expect(lines.rejected).toEqual([]);
    expect(report.status).toBe('loaded');
    expect(report.unmatched.map((u) => u.name)).toEqual([UNMATCHED]);
    expect(report.matched).toHaveLength(lines.rows.length - 1);
  });

  it('flags the ranked essentials and resolves the places a line pairs with', async () => {
    const { rows } = await harness.pool.query<{ id: string; editorial: unknown }>(
      'SELECT id, editorial FROM pois WHERE id = ANY($1::uuid[])',
      [[ids.get('Xuan Huong Lake'), ids.get('Nem Nuong Ba Hung')]],
    );
    const note = (name: string) =>
      readEditorialOverlay(rows.find((row) => row.id === ids.get(name))?.editorial);
    const lake = lineOf('Xuan Huong Lake');
    expect(note('Xuan Huong Lake')).toMatchObject({
      must_see: true,
      essential: true,
      curated: { essential_rank: 1, area: lake.area, prominence: lake.prominence },
    });
    const nem = note('Nem Nuong Ba Hung');
    expect(nem.essential).toBeUndefined();
    expect(nem.curated?.pairs_with).toEqual([
      { name: 'Da Lat Market', poi_id: ids.get('Da Lat Market') },
    ]);
  });

  it('replaces an AI estimate curve with the line’s busy windows and keeps what crews saw', async () => {
    const week = busyWeek(lineOf('Xuan Huong Lake').busy_windows ?? []);
    expect(week.length).toBeGreaterThan(0);
    expect(await curves(ids.get('Xuan Huong Lake')!)).toEqual(
      week.map((day) => ({ source: 'estimate', dow: day.dow, hourly: day.hourly })),
    );
    const crazy = await curves(ids.get('Crazy House')!);
    expect(crazy.filter((c) => c.source === 'visits').map((c) => c.dow)).toEqual([6]);
  });

  it('plans a curated place from its line over its AI profile', async () => {
    await harness.pool.query(
      `INSERT INTO ops.ops_config (key, value) VALUES ($1, 'true'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [TYPED_PLACES_KEY],
    );
    const places = await loadDraftPlaces(harness.pool, dalat, []);
    const nem = lineOf('Nem Nuong Ba Hung');
    const planned = places.find((p) => p.id === ids.get('Nem Nuong Ba Hung'));
    expect(planned).toMatchObject({
      bestTimes: nem.best_times,
      mealRole: nem.meal_role,
      dish: nem.dish,
      visitMin: nem.visit_minutes,
      essentialRank: null,
    });
    for (const tag of nem.tags ?? []) expect(planned?.tags).toContain(tag);
    expect(places.find((p) => p.id === ids.get('Crazy House'))?.essentialRank).toBe(
      lineOf('Crazy House').essential_rank,
    );
  });
});

describe('a destination’s itinerary', () => {
  it('is stored with each place’s row and read back resolved', async () => {
    const loaded = await loadCuratedItinerary(harness.pool, itinerary, placedOf(report), {
      dryRun: false,
    });
    expect(loaded).toMatchObject({ status: 'loaded', unresolved: [UNMATCHED] });
    const stored = await read();
    expect(stored?.idealDays).toEqual(itinerary.ideal_days);
    expect(stored?.days.map((d) => d.stops.map((s) => s.name))).toEqual(
      itinerary.consensus_days.map((d) => d.stops),
    );
    for (const stop of stored?.days.flatMap((d) => d.stops) ?? []) {
      expect(stop.poiId, stop.name).toBe(ids.get(stop.name) ?? null);
    }
    expect(stored?.areas.map((a) => a.name)).toEqual(itinerary.areas.map((a) => a.name));
    expect(stored?.tips.vi).toEqual(itinerary.city_tips_vi);
    expect(stored?.sources).toHaveLength(itinerary.sources.length);
  });

  it('reads a merged place as the row it went into and a closed one by name only', async () => {
    const { rows } = await harness.pool.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Hồ Xuân Hương', 'nature', 11.94, 108.44) RETURNING id`,
      [dalat],
    );
    const kept = rows[0]!.id;
    await harness.pool.query(
      `UPDATE pois SET merged_into_id = $2, status = 'hidden' WHERE id = $1`,
      [ids.get('Xuan Huong Lake'), kept],
    );
    await harness.pool.query(`UPDATE pois SET status = 'closed' WHERE id = $1`, [
      ids.get('Crazy House'),
    ]);
    const stops = (await read())?.days.flatMap((d) => d.stops) ?? [];
    expect(stops.find((s) => s.name === 'Xuan Huong Lake')?.poiId).toBe(kept);
    expect(stops.find((s) => s.name === 'Crazy House')?.poiId).toBeNull();
  });

  it('is replaced by a later load, and only checked on a dry run', async () => {
    const shorter: CuratedItinerary = {
      ...itinerary,
      ideal_days: { min: 2, max: 2 },
      consensus_days: itinerary.consensus_days.slice(0, 2),
    };
    const checked = await loadCuratedItinerary(harness.pool, shorter, placedOf(report), {
      dryRun: true,
    });
    expect(checked.status).toBe('checked');
    expect((await read())?.days).toHaveLength(itinerary.consensus_days.length);
    await loadCuratedItinerary(harness.pool, shorter, placedOf(report), { dryRun: false });
    const stored = await read();
    expect(stored?.idealDays).toEqual({ min: 2, max: 2 });
    expect(stored?.days).toHaveLength(2);
    const { rows } = await harness.pool.query('SELECT 1 FROM destination_itineraries');
    expect(rows).toHaveLength(1);
  });
});
