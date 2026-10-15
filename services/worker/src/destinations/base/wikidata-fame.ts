/**
 * Fame of GeoNames cities from Wikidata, looked up by their GeoNames id (Wikidata P1566): a city
 * the Wikivoyage-linked query does not return still gets its sitelinks, photo and labels.
 */
import type { BaseCandidate } from '@cp/domain';

import { inPool, runQuery, type WikidataOptions } from './wdqs';
import { commonsFileName, MIN_SITELINKS } from './wikidata';

/** GeoNames ids per query when looking cities up by their GeoNames id (Wikidata P1566). */
export const GEONAMES_IDS_PER_QUERY = 400;

export function byGeonamesQuery(ids: readonly number[]): string {
  return `SELECT ?item ?gn ?sitelinks ?image ?banner ?en ?vi WHERE {
  VALUES ?gn { ${ids.map((id) => `"${String(id)}"`).join(' ')} }
  ?item wdt:P1566 ?gn ; wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P948 ?banner }
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?vi FILTER(lang(?vi) = "vi") }
}`;
}

export interface WikidataFame {
  readonly qid: string;
  readonly sitelinks: number;
  readonly photoFile: string | null;
  readonly en?: string;
  readonly vi?: string;
}

/**
 * Fame and photo of GeoNames cities by their GeoNames id: a city with no Wikivoyage article is
 * missed by the candidate query, and without its sitelinks it would rank as unknown.
 */
export async function loadWikidataByGeonames(
  ids: readonly number[],
  options: WikidataOptions = {},
): Promise<Map<number, WikidataFame>> {
  const fame = new Map<number, WikidataFame>();
  const batches: number[][] = [];
  for (let at = 0; at < ids.length; at += GEONAMES_IDS_PER_QUERY) {
    batches.push(ids.slice(at, at + GEONAMES_IDS_PER_QUERY));
  }
  const results = await inPool(
    batches.map(
      (batch, index) => () =>
        runQuery(byGeonamesQuery(batch), `geonames ids page ${String(index + 1)}`, options),
    ),
    5,
  );
  for (const row of results.flat()) {
    const item = row['item']?.value;
    const gn = Number(row['gn']?.value);
    if (item === undefined || !Number.isInteger(gn)) continue;
    const sitelinks = Number(row['sitelinks']?.value ?? 0);
    const known = fame.get(gn);
    if (known !== undefined && known.sitelinks >= sitelinks) continue;
    const en = row['en']?.value;
    const vi = row['vi']?.value;
    fame.set(gn, {
      qid: item.slice(item.lastIndexOf('/') + 1),
      sitelinks,
      photoFile: commonsFileName(row['banner']?.value ?? row['image']?.value ?? ''),
      ...(en === undefined ? {} : { en }),
      ...(vi === undefined ? {} : { vi }),
    });
  }
  return fame;
}

/**
 * GeoNames cities with their Wikidata id, sitelinks, photo and labels where Wikidata has them. An
 * item under 10 sitelinks is ignored: GeoNames ids often point at a stub twin of the real item
 * ("Granada city", "Bilbao City", "Chongqing Shi"), whose label would rename the city and stop it
 * joining the real item by name.
 */
export function withFame(
  cities: readonly BaseCandidate[],
  fame: ReadonlyMap<number, WikidataFame>,
): BaseCandidate[] {
  return cities.map((city) => {
    const found = city.geonamesId === null ? undefined : fame.get(city.geonamesId);
    if (found === undefined || found.sitelinks < MIN_SITELINKS) return city;
    return {
      ...city,
      qid: city.qid ?? found.qid,
      sitelinks: found.sitelinks,
      photoFile: found.photoFile,
      names: {
        ...city.names,
        ...(found.en === undefined ? {} : { en: found.en }),
        ...(found.vi === undefined ? {} : { vi: found.vi }),
      },
      name: city.countryCode === 'VN' ? (found.vi ?? city.name) : (found.en ?? city.name),
    };
  });
}
