/**
 * One base-set build: GeoNames and Wikidata candidates are joined, ranked and capped per country,
 * planned against the rows that exist (seed, critter and area rows are only enriched; base rows
 * keep their slugs), written in one statement, and their Commons photos stored. The summary
 * counts rows per country, Vietnam's rows, and the critter cities the build could not place.
 */
import { withSystem } from '@cp/db';
import {
  BASE_CAP_RULES,
  CRITTER_HOMES,
  joinSources,
  planUpsert,
  rankAndCap,
  type BaseCandidate,
} from '@cp/domain';
import type pg from 'pg';

import { loadGeoNames, type GeoNamesFiles } from './geonames';
import { storeBasePhotos, type PhotoCounts } from './photos';
import { loadExistingDestinations, toRecord, upsertBaseRows } from './upsert';
import { loadWikidataCandidates } from './wikidata';

export interface BaseBuildOptions {
  readonly dryRun?: boolean;
  readonly skipPhotos?: boolean;
  readonly fetch?: typeof fetch;
  readonly now?: Date;
  /** Already-loaded sources (tests and repeated runs). */
  readonly sources?: { readonly geonames: GeoNamesFiles; readonly wikidata: BaseCandidate[] };
}

export interface BaseBuildSummary {
  readonly dryRun: boolean;
  readonly candidates: {
    readonly wikidata: number;
    readonly geonames: number;
    readonly joined: number;
  };
  readonly kept: number;
  readonly inserted: number;
  readonly enriched: number;
  readonly perCountry: Readonly<Record<string, number>>;
  readonly vietnam: number;
  /** Critter-city rows the build found no candidate for (their critter keeps its table home). */
  readonly unplacedCritterCities: readonly string[];
  readonly photos: PhotoCounts | null;
}

export async function runBaseBuild(
  pool: pg.Pool,
  options: BaseBuildOptions = {},
): Promise<BaseBuildSummary> {
  const now = options.now ?? new Date();
  const fetchImpl = options.fetch ?? fetch;
  const sources = options.sources ?? {
    geonames: await loadGeoNames(fetchImpl),
    wikidata: await loadWikidataCandidates({ fetch: fetchImpl }),
  };
  const joined = joinSources(sources.wikidata, sources.geonames.cities);
  const ranked = rankAndCap(joined, {
    ...BASE_CAP_RULES,
    critterCountries: new Set(CRITTER_HOMES.map((home) => home.country)),
  });
  const countryNames = new Map(
    [...sources.geonames.countries].map(([code, info]) => [code, info.name]),
  );
  const existing = await withSystem(pool, loadExistingDestinations);
  const planned = planUpsert(ranked, existing, countryNames);
  const perCountry: Record<string, number> = {};
  for (const row of planned) {
    const code = row.candidate.countryCode;
    perCountry[code] = (perCountry[code] ?? 0) + 1;
  }
  const placed = new Set(
    planned.flatMap((row) => (row.existing === null ? [] : [row.existing.id])),
  );
  const unplacedCritterCities = existing
    .filter((row) => row.origin === 'critter' && !placed.has(row.id) && row.qid === null)
    .map((row) => row.slug);
  const base = {
    dryRun: options.dryRun === true,
    candidates: {
      wikidata: sources.wikidata.length,
      geonames: sources.geonames.cities.length,
      joined: joined.length,
    },
    kept: planned.length,
    perCountry,
    vietnam: perCountry['VN'] ?? 0,
    unplacedCritterCities,
  };
  if (options.dryRun === true) return { ...base, inserted: 0, enriched: 0, photos: null };
  const records = planned.map((row) => toRecord(row, sources.geonames.countries));
  const counts = await withSystem(pool, (tx) => upsertBaseRows(tx, records, now));
  const photos =
    options.skipPhotos === true
      ? null
      : await storeBasePhotos(
          pool,
          planned.flatMap((row) =>
            row.candidate.photoFile === null
              ? []
              : [{ slug: row.slug, file: row.candidate.photoFile }],
          ),
          { fetch: fetchImpl, now },
        );
  return { ...base, ...counts, photos };
}
