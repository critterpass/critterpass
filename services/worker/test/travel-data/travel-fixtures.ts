/**
 * Shared travel-data test set-up: the six live destinations, and supplier clients that answer from
 * responses recorded from the real suppliers (packages/suppliers/test/*\/fixtures and
 * test/fixtures/weatherapi). A request with no recording fails like a network error, so a test can
 * never pass on a response nobody recorded.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TRAVEL_DESTINATIONS } from '@cp/domain';
import {
  createSupplierHttp,
  fetchFareMonth,
  type SupplierCallRecord,
  type SupplierHttp,
} from '@cp/suppliers';
import type pg from 'pg';

const REPO = path.resolve(import.meta.dirname, '../../../..');
export const TRAVELPAYOUTS_FIXTURES = path.join(
  REPO,
  'packages/suppliers/test/travelpayouts/fixtures',
);

export async function insertLiveDestinations(pool: pg.Pool): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const slug of Object.keys(TRAVEL_DESTINATIONS)) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, coverage) VALUES ($1, $1, 'live')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [slug],
    );
    ids[slug] = rows[0]?.id ?? '';
  }
  return ids;
}

export interface RecordedRoute {
  readonly path: string;
  readonly params: Readonly<Record<string, string>>;
  readonly file: string;
  readonly status?: number;
}

export function recordedHttp(dir: string, routes: readonly RecordedRoute[]) {
  const audits: SupplierCallRecord[] = [];
  const urls: URL[] = [];
  const http: SupplierHttp = createSupplierHttp({
    audit: (record) => {
      audits.push(record);
      return Promise.resolve();
    },
    sleep: () => Promise.resolve(),
    fetch: (input) => {
      const url = new URL(input);
      urls.push(url);
      const route = routes.find(
        (candidate) =>
          candidate.path === url.pathname &&
          Object.entries(candidate.params).every(([k, v]) => url.searchParams.get(k) === v),
      );
      if (route === undefined) return Promise.reject(new Error(`unrecorded ${url.pathname}`));
      return Promise.resolve(
        new Response(readFileSync(path.join(dir, route.file), 'utf8'), {
          status: route.status ?? 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  });
  return { http, audits, urls };
}

export const RECORDED_FARE_ROUTES: readonly RecordedRoute[] = [
  ['SIN', 'DPS', '2026-11', 'prices-for-dates-sin-dps-2026-11.json'],
  ['SIN', 'KIX', '2027-04', 'prices-for-dates-sin-kix-2027-04.json'],
  ['HAN', 'CUZ', '2027-02', 'prices-for-dates-han-cuz-2027-02.json'],
].map(([origin, destination, month, file]) => ({
  path: '/aviasales/v3/prices_for_dates',
  params: { origin: origin!, destination: destination!, departure_at: month! },
  file: file!,
}));

export function recordedFares() {
  const recorded = recordedHttp(TRAVELPAYOUTS_FIXTURES, RECORDED_FARE_ROUTES);
  return {
    ...recorded,
    fetchMonth: (query: Parameters<typeof fetchFareMonth>[2], signal?: AbortSignal) =>
      fetchFareMonth(recorded.http, { token: 'test-token' }, query, signal),
  };
}

export const WEATHERAPI_FIXTURES = path.resolve(import.meta.dirname, '../fixtures/weatherapi');

export interface PlanItemSeed {
  readonly category: string;
  readonly isOutdoor: boolean;
  readonly startsAt: Date;
  readonly poiId?: string;
}

const TO_STATUS = ['drafting', 'draft_review', 'proposed', 'confirmed', 'pre_trip', 'in_trip'];

/** A crew trip at `destinationId`, walked to `status`, with a current plan holding `items`. */
export async function insertTripWithPlan(
  pool: pg.Pool,
  options: {
    readonly crewId: string;
    readonly destinationId: string;
    readonly status: 'confirmed' | 'pre_trip' | 'in_trip';
    readonly items: readonly PlanItemSeed[];
  },
): Promise<{ tripId: string; stableIds: string[] }> {
  const trip = await pool.query<{ id: string }>(
    `INSERT INTO trips (crew_id, status, destination_id, tz, start_date, end_date)
     VALUES ($1, 'setup', $2, 'Asia/Makassar', CURRENT_DATE - 1, CURRENT_DATE + 5) RETURNING id`,
    [options.crewId, options.destinationId],
  );
  const tripId = trip.rows[0]?.id ?? '';
  for (const status of TO_STATUS.slice(0, TO_STATUS.indexOf(options.status) + 1)) {
    await pool.query('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
  const version = await pool.query<{ id: string }>(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  );
  const versionId = version.rows[0]?.id ?? '';
  const day = await pool.query<{ id: string }>(
    'INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 1) RETURNING id',
    [versionId, tripId],
  );
  const stableIds: string[] = [];
  for (const item of options.items) {
    const { rows } = await pool.query<{ stable_id: string }>(
      `INSERT INTO plan_items (version_id, day_id, trip_id, starts_at, ends_at, tz, category,
         is_outdoor, poi_id)
       VALUES ($1, $2, $3, $4, $5, 'Asia/Makassar', $6, $7, $8) RETURNING stable_id`,
      [
        versionId,
        day.rows[0]?.id,
        tripId,
        item.startsAt,
        new Date(item.startsAt.getTime() + 2 * 3_600_000),
        item.category,
        item.isOutdoor,
        item.poiId ?? null,
      ],
    );
    stableIds.push(rows[0]?.stable_id ?? '');
  }
  await pool.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [versionId, tripId]);
  return { tripId, stableIds };
}

export const RECORDED_WEATHER_ROUTES: readonly RecordedRoute[] = [
  {
    path: '/v1/forecast.json',
    params: { q: '-8.5069,115.2625' },
    file: 'forecast-bali-ubud-3d.json',
  },
  {
    path: '/v1/marine.json',
    params: { q: '-8.5300,115.5100' },
    file: 'marine-bali-padang-bai-1d.json',
  },
];

export const HAZARD_FIXTURES = path.resolve(import.meta.dirname, '../fixtures/hazards');

export const RECORDED_HAZARD_ROUTES: readonly RecordedRoute[] = [
  { path: '/v1/gunung-api/tingkat-aktivitas', params: {}, file: 'magma-tingkat-aktivitas.html' },
  {
    path: '/earthquakes-and-volcanism/volcanoes/vona-notifications/',
    params: {},
    file: 'imo-vona-notifications.html',
  },
  { path: '/bosai/warning/data/warning/260000.json', params: {}, file: 'jma-warning-260000.json' },
  { path: '/news/WeeklyVolcanoRSS.xml', params: {}, file: 'gvp-weekly-volcano-rss.xml' },
];

/** A recorded file read as the feed serves it (`latin1` for the GVP report). */
export function readHazardFixture(file: string, encoding: BufferEncoding = 'utf8'): string {
  return readFileSync(path.join(HAZARD_FIXTURES, file), encoding);
}
