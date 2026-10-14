/**
 * Vietnam's one-time top-up: for each province (GeoNames admin1; towns kept their names through
 * the 2025 province merger), its 15 most populous `cities5000` towns go to `destination.vn_picks`,
 * which picks up to four travel-worthy ones from that closed list. A pick becomes a base row (or
 * enriches the row it already is) marked `names.source = 'vn_pick'`; rebuilds never remove rows,
 * so picks stay. The list with each reason is returned for a person to check.
 */
import { pickVietnamTowns, type Gateway, type VnPickCandidate } from '@cp/ai';
import { withSystem } from '@cp/db';
import { baseScore, planUpsert, type BaseCandidate } from '@cp/domain';
import type pg from 'pg';

import {
  download,
  parseAdmin1,
  parseAlternateNames,
  parseCities,
  parseCountryInfo,
  unzipEntry,
} from './geonames';
import { loadExistingDestinations, toRecord, upsertBaseRows } from './upsert';

export const TOWNS_PER_PROVINCE = 15;

export interface ProvinceTowns {
  readonly province: string;
  readonly towns: readonly BaseCandidate[];
}

/** Each province's most populous towns, most populous first. */
export function provinceShortlists(rows: readonly BaseCandidate[]): ProvinceTowns[] {
  const byProvince = new Map<string, BaseCandidate[]>();
  for (const row of rows) {
    if (row.admin1 === null) continue;
    byProvince.set(row.admin1, [...(byProvince.get(row.admin1) ?? []), row]);
  }
  return [...byProvince]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([province, towns]) => ({
      province,
      towns: [...towns]
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
        .slice(0, TOWNS_PER_PROVINCE),
    }));
}

export interface VnPickLine {
  readonly province: string;
  readonly name: string;
  readonly geonamesId: number;
  readonly population: number | null;
  readonly reason: string;
}

export interface VnTopUpResult {
  readonly picks: readonly VnPickLine[];
  readonly inserted: number;
  readonly enriched: number;
  readonly costMicros: number;
}

export async function runVietnamTopUp(
  pool: pg.Pool,
  gateway: Pick<Gateway, 'callModel'>,
  options: { readonly dryRun?: boolean; readonly fetch?: typeof fetch; readonly now?: Date } = {},
): Promise<VnTopUpResult> {
  const fetchImpl = options.fetch ?? fetch;
  const text = async (file: string) =>
    Buffer.from(await download(fetchImpl, file)).toString('utf8');
  const admin1 = parseAdmin1(await text('admin1CodesASCII.txt'));
  const countries = parseCountryInfo(await text('countryInfo.txt'));
  const alternates = parseAlternateNames(
    unzipEntry(await download(fetchImpl, 'alternatenames/VN.zip'), 'VN.txt'),
  );
  const towns = parseCities(
    unzipEntry(await download(fetchImpl, 'cities5000.zip'), 'cities5000.txt'),
    { admin1, alternates, country: 'VN', all: true },
  );
  const picks: VnPickLine[] = [];
  const picked: BaseCandidate[] = [];
  let costMicros = 0;
  for (const { province, towns: shortlist } of provinceShortlists(towns)) {
    const candidates: VnPickCandidate[] = shortlist.map((town) => ({
      id: town.geonamesId ?? 0,
      name: town.name,
      population: town.population,
    }));
    const result = await pickVietnamTowns(gateway, province, candidates);
    costMicros += result.costMicros;
    for (const pick of result.picks) {
      const town = shortlist.find((row) => row.geonamesId === pick.id);
      if (town === undefined) continue;
      picked.push(town);
      picks.push({
        province,
        name: town.name,
        geonamesId: pick.id,
        population: town.population,
        reason: pick.reason,
      });
    }
  }
  if (options.dryRun === true) return { picks, inserted: 0, enriched: 0, costMicros };
  const names = new Map([...countries].map(([code, info]) => [code, info.name]));
  return withSystem(pool, async (tx) => {
    const existing = await loadExistingDestinations(tx);
    const planned = planUpsert(
      picked.map((town) => ({ ...town, score: baseScore(town) })),
      existing,
      names,
    );
    const counts = await upsertBaseRows(
      tx,
      planned.map((row) => toRecord(row, countries)),
      options.now ?? new Date(),
    );
    await tx.query(
      `UPDATE destinations SET names = names || '{"source": "vn_pick"}'::jsonb
        WHERE slug = ANY ($1::text[])`,
      [planned.map((row) => row.slug)],
    );
    return { picks, ...counts, costMicros };
  });
}
