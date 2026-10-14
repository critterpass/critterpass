/**
 * Writes a planned base set in one statement: every planned row goes in through
 * `jsonb_to_recordset` and one `INSERT … ON CONFLICT (slug)`. A new row becomes a `base` row with
 * a default box around its centre; an existing row is enriched (ids, centre, population, names,
 * kind, region). A seed, critter or area row keeps its name, country, coverage, set and critter;
 * a base row also takes the build's name, country, currency and time zone.
 */
import {
  boundsHalfKm,
  type BaseCandidate,
  type ExistingDestination,
  type PlannedRow,
  type RankedDestination,
} from '@cp/domain';
import type pg from 'pg';

import type { CountryInfo } from './geonames';

export async function loadExistingDestinations(tx: pg.PoolClient): Promise<ExistingDestination[]> {
  const { rows } = await tx.query<{
    id: string;
    slug: string;
    name: string;
    country: string | null;
    country_code: string | null;
    origin: ExistingDestination['origin'];
    wikidata_qid: string | null;
    geonames_id: number | null;
  }>(
    `SELECT id, slug, name, country, country_code, origin, wikidata_qid, geonames_id
       FROM destinations ORDER BY slug`,
  );
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    country: row.country,
    countryCode: row.country_code,
    origin: row.origin,
    qid: row.wikidata_qid,
    geonamesId: row.geonames_id,
  }));
}

interface Record_ {
  slug: string;
  name: string;
  country: string | null;
  country_code: string;
  currency: string | null;
  tz: string | null;
  qid: string | null;
  geonames_id: number | null;
  admin1: string | null;
  kind: BaseCandidate['kind'];
  lat: number;
  lng: number;
  population: number | null;
  names: Record<string, string>;
  base_rank: number;
  half_km: number;
}

export function toRecord(
  row: PlannedRow<RankedDestination>,
  countries: ReadonlyMap<string, CountryInfo>,
): Record_ {
  const c = row.candidate;
  const country = countries.get(c.countryCode);
  return {
    slug: row.slug,
    name: c.name.slice(0, 120),
    country: country?.name ?? null,
    country_code: c.countryCode,
    currency: country?.currency ?? null,
    tz: c.tz ?? null,
    qid: c.qid,
    geonames_id: c.geonamesId,
    admin1: c.admin1?.slice(0, 80) ?? null,
    kind: c.kind,
    lat: c.lat,
    lng: c.lng,
    population: c.population === null ? null : Math.min(c.population, 2_000_000_000),
    names: Object.fromEntries(
      Object.entries(c.names).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
    base_rank: Math.round(c.score * 1000) / 1000,
    half_km: boundsHalfKm(c.kind),
  };
}

export interface UpsertCounts {
  readonly inserted: number;
  readonly enriched: number;
}

/** Writes the rows; returns how many were new and how many enriched. */
export async function upsertBaseRows(
  tx: pg.PoolClient,
  records: readonly Record_[],
  builtAt: Date,
): Promise<UpsertCounts> {
  if (records.length === 0) return { inserted: 0, enriched: 0 };
  const { rows } = await tx.query<{ inserted: boolean }>(
    `INSERT INTO destinations AS d (slug, name, country, country_code, currency, tz, wikidata_qid,
       geonames_id, admin1, kind, lat, lng, population, names, base_rank, origin, coverage,
       place_bounds, base_built_at)
     SELECT r.slug, r.name, r.country, r.country_code, r.currency, r.tz, r.qid, r.geonames_id,
            r.admin1, r.kind, r.lat, r.lng, r.population, r.names, r.base_rank, 'base', 'guest',
            ST_MakeEnvelope(r.lng - r.half_km / (111.32 * cos(radians(r.lat))),
                            r.lat - r.half_km / 110.57,
                            r.lng + r.half_km / (111.32 * cos(radians(r.lat))),
                            r.lat + r.half_km / 110.57, 4326)::geography,
            $2
       FROM jsonb_to_recordset($1::jsonb) AS r(slug text, name text, country text,
            country_code text, currency text, tz text, qid text, geonames_id integer, admin1 text,
            kind text, lat double precision, lng double precision, population integer,
            names jsonb, base_rank real, half_km double precision)
     ON CONFLICT (slug) DO UPDATE SET
       wikidata_qid = coalesce(EXCLUDED.wikidata_qid, d.wikidata_qid),
       geonames_id = coalesce(EXCLUDED.geonames_id, d.geonames_id),
       country_code = EXCLUDED.country_code,
       admin1 = coalesce(EXCLUDED.admin1, d.admin1),
       kind = EXCLUDED.kind,
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       population = coalesce(EXCLUDED.population, d.population),
       names = d.names || EXCLUDED.names,
       base_rank = EXCLUDED.base_rank,
       base_built_at = EXCLUDED.base_built_at,
       name = CASE WHEN d.origin = 'base' THEN EXCLUDED.name ELSE d.name END,
       country = CASE WHEN d.origin = 'base' THEN EXCLUDED.country ELSE d.country END,
       currency = CASE WHEN d.origin = 'base' THEN coalesce(EXCLUDED.currency, d.currency)
                       ELSE d.currency END,
       tz = CASE WHEN d.origin = 'base' THEN coalesce(EXCLUDED.tz, d.tz) ELSE d.tz END,
       place_bounds = CASE WHEN d.origin = 'base' THEN coalesce(d.place_bounds, EXCLUDED.place_bounds)
                           ELSE d.place_bounds END
     RETURNING (xmax = 0) AS inserted`,
    [JSON.stringify(records), builtAt],
  );
  const inserted = rows.filter((row) => row.inserted).length;
  return { inserted, enriched: rows.length - inserted };
}
