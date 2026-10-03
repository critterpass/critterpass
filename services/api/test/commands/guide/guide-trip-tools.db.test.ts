/**
 * The guide's trip tools against real Postgres, as `guide_reader` through `llm.*` only: the place
 * search inside a Đà Nẵng trip (a hotel typed with "khách sạn", accents dropped or words swapped,
 * places near it with their distance, the guide's recommended places, the trip's stay) and the
 * plan read (every trip day, items in local time, a trip with no plan yet).
 */
import { randomUUID } from 'node:crypto';

import { readPlan, type RunAsGuideReader } from '@cp/ai';
import { runMigrations, withGuideReader } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { placesSearchTool } from '../../../src/places/tool-executors';
import { seedGuideTrip } from '../../ai/guide-action-seed';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let uid: string;
let tripId: string;
const poi: Record<string, string> = {};

async function one(sql: string, values: unknown[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(sql, values);
  return rows[0]!.id;
}

async function place(
  destination: string,
  name: string,
  category: string,
  at: readonly [number, number],
  extra: { tags?: string[]; whyGo?: string } = {},
): Promise<string> {
  const id = await one(
    `INSERT INTO pois (destination_id, name, category, lat, lng, tags, curation, editorial)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      destination,
      name,
      category,
      at[0],
      at[1],
      extra.tags ?? [],
      extra.whyGo === undefined ? 'auto' : 'editorial',
      JSON.stringify(extra.whyGo === undefined ? {} : { why_go: extra.whyGo }),
    ],
  );
  poi[name] = id;
  return id;
}

const read: RunAsGuideReader = (asker, trip, fn) => withGuideReader(pool, asker, trip ?? '', fn);
const search = (input: Parameters<typeof placesSearchTool>[3]) =>
  placesSearchTool(pool, uid, tripId, input);

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  const daNang = await one(
    "INSERT INTO destinations (slug, name, coverage, tz) VALUES ('da-nang', 'Đà Nẵng', 'live', 'Asia/Ho_Chi_Minh') RETURNING id",
    [],
  );
  const hoiAn = await one(
    "INSERT INTO destinations (slug, name, coverage, tz) VALUES ('hoi-an', 'Hội An', 'live', 'Asia/Ho_Chi_Minh') RETURNING id",
    [],
  );
  await place(daNang, 'Avatar Danang Hotel', 'stay', [16.064, 108.244], {
    whyGo: 'Steps from My Khe beach.',
  });
  await place(daNang, 'Avatar Karaoke', 'nightlife', [16.05, 108.22]);
  await place(daNang, 'Avatar Rooftop Bar', 'nightlife', [16.07, 108.23]);
  await place(hoiAn, 'Karaoke Avatar Hội An', 'nightlife', [15.88, 108.33]);
  await place(daNang, 'Herbal Spa', 'health', [16.0652, 108.245], { tags: ['massage'] });
  await place(daNang, 'Sen Spa', 'health', [16.04, 108.21], { tags: ['massage'] });
  await place(daNang, 'Cộng Cà Phê Sân Bay', 'food', [16.045, 108.2]);
  await place(daNang, 'Quán Ăn Nhanh', 'food', [16.0642, 108.2442]);
  await place(daNang, 'Bánh Mì Bà Lan', 'food', [16.066, 108.246], {
    whyGo: 'The crew-favourite bánh mì by the beach.',
  });

  uid = await one(
    "INSERT INTO users (id, status) VALUES (uuidv7(), 'registered') RETURNING id",
    [],
  );
  ({ tripId } = await seedGuideTrip(pool, { organiser: uid, members: [] }));
  await pool.query(
    `UPDATE trips SET destination_id = $2, start_date = '2026-10-02', end_date = '2026-10-04',
            tz = 'Asia/Ho_Chi_Minh' WHERE id = $1`,
    [tripId, daNang],
  );
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('places_search in a trip', () => {
  it.each(['Khách sạn avatar đà nẵng', 'avatar hotel', 'HOTEL Avatar', 'ks avatar danang'])(
    'finds the hotel typed as "%s", and nothing from another destination',
    async (typed) => {
      const results = await search({ query: typed });
      expect(results[0]).toMatchObject({
        poi_id: poi['Avatar Danang Hotel'],
        match: 'exact',
        recommended: true,
        why_go: 'Steps from My Khe beach.',
      });
      expect(results.map((r) => r.name)).not.toContain('Karaoke Avatar Hội An');
    },
  );

  it('matches a name typed without its accents', async () => {
    const results = await search({ query: 'cong ca phe san bay' });
    expect(results[0]).toMatchObject({ name: 'Cộng Cà Phê Sân Bay', match: 'exact' });
  });

  it('offers the closest names, marked close, for a place not in the catalogue', async () => {
    const results = await search({ query: 'Avatar Grand Hotel' });
    expect(results[0]).toMatchObject({ name: 'Avatar Danang Hotel', match: 'close' });
    expect(results.every((r) => r.match === 'close')).toBe(true);
    expect(await search({ query: 'Sheraton Grand' })).toEqual([]);
  });

  it('measures from the hotel named as typed, nearest first', async () => {
    const results = await search({ query: 'massage', near_name: 'ks avatar' });
    expect(results.map((r) => r.name)).toEqual(['Herbal Spa', 'Sen Spa']);
    expect(results[0]?.distance_from).toBe('Avatar Danang Hotel');
    expect(results[0]?.distance_m).toBeGreaterThan(100);
    expect(results[0]?.distance_m).toBeLessThan(300);
    expect(results[1]?.distance_m).toBeGreaterThan(3000);
  });

  it('keeps only the recommended places when asked, nearest first, never the reference', async () => {
    const results = await search({ near_name: 'Avatar Danang Hotel', recommended_only: true });
    expect(results.map((r) => r.name)).toEqual(['Bánh Mì Bà Lan']);
    expect(results[0]).toMatchObject({ recommended: true, distance_from: 'Avatar Danang Hotel' });
  });

  it('answers nothing near a place it cannot find, rather than measuring from elsewhere', async () => {
    expect(await search({ near_name: 'Sheraton', category: 'food' })).toEqual([]);
  });

  it("measures from the trip's stay once the plan has one", async () => {
    expect(await search({ near_stay: true })).toEqual([]);
    await pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, poi_id, category, notes)
       SELECT t.current_version_id, d.id, t.id, $2, 'stay', 'Check in'
         FROM trips t JOIN plan_days d ON d.version_id = t.current_version_id AND d.day_no = 1
        WHERE t.id = $1`,
      [tripId, poi['Avatar Danang Hotel']],
    );
    const results = await search({ near_stay: true, category: 'food' });
    expect(results[0]).toMatchObject({
      name: 'Quán Ăn Nhanh',
      distance_from: 'Avatar Danang Hotel',
    });
  });
});

describe('plan_read in a trip', () => {
  it("lists every trip day with items in the trip's local time", async () => {
    const stableId = randomUUID();
    await pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, poi_id, starts_at, category)
       SELECT t.current_version_id, d.id, t.id, $2, $3, '2026-10-02T02:30:00Z', 'food'
         FROM trips t JOIN plan_days d ON d.version_id = t.current_version_id AND d.day_no = 1
        WHERE t.id = $1`,
      [tripId, stableId, poi['Bánh Mì Bà Lan']],
    );
    const plan = await readPlan(read, { uid, tripId, caller: 'C', route: 'guide.chat' }, undefined);
    expect(plan.version).not.toBeNull();
    expect(plan.days.map((day) => [day.day_no, day.date])).toEqual([
      [1, '2026-10-02'],
      [2, '2026-10-03'],
      [3, '2026-10-04'],
    ]);
    expect(plan.days[0]?.items).toContainEqual(
      expect.objectContaining({
        item_id: stableId,
        title: 'Bánh Mì Bà Lan',
        starts_at: '2026-10-02T09:30:00+07:00',
      }),
    );
    const dayTwo = await readPlan(read, { uid, tripId, caller: 'C', route: 'guide.chat' }, 2);
    expect(dayTwo.days).toEqual([{ day_no: 2, date: '2026-10-03', items: [] }]);
  });

  it('answers a trip with no plan yet with its days and no version', async () => {
    const other = await seedGuideTrip(pool, { organiser: uid, members: [] });
    await pool.query(
      "UPDATE trips SET start_date = '2026-11-01', end_date = '2026-11-02', current_version_id = NULL WHERE id = $1",
      [other.tripId],
    );
    const plan = await readPlan(
      read,
      { uid, tripId: other.tripId, caller: 'C', route: 'guide.chat' },
      undefined,
    );
    expect(plan).toEqual({
      version: null,
      days: [
        { day_no: 1, date: '2026-11-01', items: [] },
        { day_no: 2, date: '2026-11-02', items: [] },
      ],
    });
  });
});
