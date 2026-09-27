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
