/**
 * A base destination's facts-only texts (`destinations.describe`): the line and about text in
 * English and Vietnamese, written by `destination.describe` from the row's own Wikidata and
 * GeoNames facts and checked (lengths, no number the facts lack) before they are stored in
 * `texts`. Other app languages fall back to English. Spend on the route per UTC day stops at
 * `DESTINATIONS_DESCRIBE_DAILY_CAP_USD`; a row over the cap waits for the next build's queue.
 */
import { describeDestination, DESTINATION_DESCRIBE_ROUTE, type Gateway } from '@cp/ai';
import { withSystem } from '@cp/db';
import type pg from 'pg';

export interface DescribeDeps {
  readonly gateway: Pick<Gateway, 'callModel'>;
  readonly dailyCapMicros: number;
  readonly now?: () => Date;
}

export type DescribeOutcome =
  | { readonly outcome: 'written' }
  | { readonly outcome: 'skipped'; readonly reason: 'missing' | 'exists' | 'daily_cap' }
  | { readonly outcome: 'rejected'; readonly reason: string };

export async function describeSpentTodayMicros(pool: pg.Pool, now: Date): Promise<number> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ micros: string }>(
      `SELECT coalesce(sum(cost_micros), 0)::text AS micros FROM ai_usage
        WHERE route = $2
          AND at >= date_trunc('day', $1::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      [now, DESTINATION_DESCRIBE_ROUTE],
    );
    return Number(rows[0]?.micros ?? 0);
  });
}

interface FactsRow {
  name: string;
  names: { en?: string; vi?: string; local?: string };
  kind: string | null;
  country: string | null;
  country_code: string | null;
  admin1: string | null;
  population: number | null;
  lat: number | null;
  lng: number | null;
  has_texts: boolean;
}

export async function describeBaseDestination(
  pool: pg.Pool,
  deps: DescribeDeps,
  destinationId: string,
  force = false,
): Promise<DescribeOutcome> {
  const row = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<FactsRow>(
      `SELECT name, names, kind, country, country_code, admin1, population,
              lat, lng,
              texts ? 'en' AND texts ? 'vi' AS has_texts
         FROM destinations WHERE id = $1`,
      [destinationId],
    );
    return rows[0];
  });
  if (row === undefined || row.lat === null || row.lng === null) {
    return { outcome: 'skipped', reason: 'missing' };
  }
  if (row.has_texts && !force) return { outcome: 'skipped', reason: 'exists' };
  const now = (deps.now ?? (() => new Date()))();
  if ((await describeSpentTodayMicros(pool, now)) >= deps.dailyCapMicros) {
    return { outcome: 'skipped', reason: 'daily_cap' };
  }
  const local = row.names.vi ?? row.names.local ?? null;
  const { verdict } = await describeDestination(deps.gateway, {
    name: row.names.en ?? row.name,
    local_name: local === row.name && row.names.en === undefined ? null : local,
    kind: row.kind ?? 'city',
    country: row.country ?? row.country_code ?? '',
    region: row.admin1,
    population: row.population,
    elevation_m: null,
    lat: Math.round(row.lat * 100) / 100,
    lng: Math.round(row.lng * 100) / 100,
  });
  if (!verdict.ok) return { outcome: 'rejected', reason: verdict.reason };
  await withSystem(pool, (tx) =>
    tx.query('UPDATE destinations SET texts = texts || $2::jsonb WHERE id = $1', [
      destinationId,
      JSON.stringify(verdict.texts),
    ]),
  );
  return { outcome: 'written' };
}
